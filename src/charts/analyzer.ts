import { GoogleGenAI } from "@google/genai";
import type {
  AnalysisResult,
  PairSummary,
  ScreenshotResult,
  TradeSetup,
} from "./chart-types.js";
import {
  extractTextFromClaudeResponse,
  getClaudeClient,
} from "../shared/claude.js";
import { withRetry } from "../shared/retry.js";
import {
  captureVerificationChartScreenshot,
  findChartForPair,
} from "./screenshot.js";
import { createLogger } from "../shared/logger.js";
import { withConfiguredRateLimit } from "../shared/rate-limit.js";
import { recordClaudeUsage, recordGeminiUsage } from "../shared/ai-usage.js";
import { getConfiguredChartSignalConfidenceThreshold } from "./chart-config-env.js";

const logger = createLogger("charts:analyzer");
const VERIFY_MODEL_PRIMARY =
  process.env.CHART_VERIFY_MODEL_PRIMARY?.trim() || "gemini-2.5-pro";
const ANALYSIS_MODEL =
  process.env.CHART_ANALYSIS_MODEL?.trim() || "gemini-3.5-flash";
const VERIFY_MODEL_CLAUDE =
  process.env.CHART_VERIFY_MODEL_CLAUDE?.trim() || "claude-sonnet-4-6";
const GEMINI_RATE_LIMIT = {
  key: "gemini",
  envVar: "GEMINI_RATE_LIMIT_RPM",
  defaultRpm: 15,
};

type VerificationResult = {
  confirmed: boolean;
  confidence: number;
  comment: string;
  verifiedBy: string;
};

type PairScreenshotGroup = {
  pair: string;
  screenshots: ScreenshotResult[];
};

function getPairName(screenshot: ScreenshotResult): string {
  return screenshot.chart.name.replace(` ${screenshot.chart.timeframe}`, "");
}

function groupScreenshotsByPair(
  screenshots: ScreenshotResult[],
): PairScreenshotGroup[] {
  const groups = new Map<string, ScreenshotResult[]>();

  for (const screenshot of screenshots) {
    const pair = getPairName(screenshot);
    const items = groups.get(pair) ?? [];
    items.push(screenshot);
    groups.set(pair, items);
  }

  return Array.from(groups.entries()).map(([pair, groupScreenshots]) => ({
    pair,
    screenshots: groupScreenshots.sort((left, right) => {
      return (
        ["D1", "H4", "M15"].indexOf(left.chart.timeframe) -
        ["D1", "H4", "M15"].indexOf(right.chart.timeframe)
      );
    }),
  }));
}

function buildSystemPrompt(threshold: number): string {
  return `Act as a professional price-action trader using Bob Volman's methodology, EMA 20, and volume.

Analyze each instrument as one multi-timeframe package:
- D1 establishes the dominant trend and major support/resistance.
- H4 identifies the Volman setup (RB, BB, ARB, FB, SB, DD, or IRB) and is the primary decision timeframe.
- M15 refines entry timing and rejects entries with noisy, contradictory price action.
- Volume must confirm a breakout or rejection. Treat weak or declining volume as a risk, never as confirmation.

Only recommend TRADE when D1 and H4 direction agree, M15 does not contradict them, price is at or near H4 EMA 20 or has a clean buildup, and volume supports the move. Missing timeframes, conflicting trends, distant price without a pullback, flat EMA, weak volume, or poor risk/reward must reduce confidence. If fewer than two timeframes agree, or confidence is below ${threshold}%, conclude NO TRADE. Never invent unreadable price levels.`;
}

function buildUserPrompt(threshold: number): string {
  return `Analyze the attached chart packages. Each image label contains pair and timeframe. Return only JSON with keys summaries, setups, and noSetupReason.

In summaries include every pair with pair, trend (describe D1/H4/M15 alignment), emaProximity (tại/gần/xa), status, and confidence.
In setups include only confluence setups with confidence >=${threshold}%; include pair, direction, setup, emaTouch, reasons, risks, confidence, entry, stopLoss, takeProfit1, takeProfit2, riskReward, and summary. Reasons must explicitly mention D1, H4, M15, and volume evidence. Provide levels from H4/M15. Omit surrounding text.`;
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenAI({ apiKey });
}

export function cleanResponse(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

export function extractJsonObject(text: string): string {
  const cleaned = cleanResponse(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

export function clampConfidence(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function toText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function detectImageMimeType(buffer: Buffer): "image/png" | "image/jpeg" {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  return "image/jpeg";
}

export function buildGenerationConfig(model: string, maxOutputTokens: number) {
  const config: {
    temperature: number;
    topP: number;
    maxOutputTokens: number;
    responseMimeType: "application/json";
    thinkingConfig?: { thinkingBudget: number };
  } = {
    temperature: 0.2,
    topP: 0.9,
    maxOutputTokens,
    responseMimeType: "application/json",
  };

  if (model === VERIFY_MODEL_PRIMARY) {
    config.maxOutputTokens = Math.max(maxOutputTokens, 900);
    config.thinkingConfig = { thinkingBudget: 128 };
  } else {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

export function parseAnalysisResponse(text: string): {
  summaries: PairSummary[];
  setups: TradeSetup[];
  noSetupReason: string;
} {
  const cleaned = extractJsonObject(text);
  try {
    const parsed = JSON.parse(cleaned) as Partial<{
      summaries: PairSummary[];
      setups: TradeSetup[];
      noSetupReason: string;
    }>;
    const threshold = getConfiguredChartSignalConfidenceThreshold();
    const setups = (parsed.setups || []).filter(
      (s) => (s.confidence ?? 0) >= threshold,
    );
    return {
      summaries: parsed.summaries || [],
      setups,
      noSetupReason: toText(parsed.noSetupReason, ""),
    };
  } catch {
    return {
      summaries: [],
      setups: [],
      noSetupReason: "Failed to parse AI response. Raw: " + text.slice(0, 300),
    };
  }
}

function parseVerificationResponse(text: string): VerificationResult | null {
  const cleaned = extractJsonObject(text);

  try {
    const parsed = JSON.parse(cleaned) as {
      confirmed?: unknown;
      confidence?: unknown;
      comment?: unknown;
    };
    return {
      confirmed: Boolean(parsed.confirmed),
      confidence: clampConfidence(parsed.confidence),
      comment: String(parsed.comment || ""),
      verifiedBy: "",
    };
  } catch {
    return null;
  }
}

export function buildVerificationPrompt(setup: TradeSetup): string {
  return `Check this H4 EMA20 setup against the attached chart.

Setup:
- Pair: ${setup.pair}
- Direction: ${setup.direction}
- Pattern: ${setup.setup}
- Entry: ${setup.entry}
- Stop loss: ${setup.stopLoss}
- Take profit 1: ${setup.takeProfit1}
- Take profit 2: ${setup.takeProfit2}
- Proposed confidence: ${setup.confidence}%
- Reasons: ${setup.reasons.slice(0, 3).join(" | ")}

Return only JSON with keys confirmed, confidence, comment.
Keep comment short and specific.`;
}

async function analyzeWithGemini(
  screenshots: ScreenshotResult[],
): Promise<string> {
  const threshold = getConfiguredChartSignalConfidenceThreshold();
  const ai = getClient();
  const parts: Array<
    { inlineData: { mimeType: string; data: string } } | { text: string }
  > = [];
  const orderedScreenshots = [...screenshots].sort((left, right) => {
    const pairOrder = left.chart.symbol.localeCompare(right.chart.symbol);
    if (pairOrder !== 0) return pairOrder;
    return (
      ["D1", "H4", "M15"].indexOf(left.chart.timeframe) -
      ["D1", "H4", "M15"].indexOf(right.chart.timeframe)
    );
  });
  for (const screenshot of orderedScreenshots) {
    parts.push({
      inlineData: {
        mimeType: detectImageMimeType(screenshot.buffer),
        data: screenshot.buffer.toString("base64"),
      },
    });
    parts.push({
      text: `[PAIR=${screenshot.chart.name.replace(` ${screenshot.chart.timeframe}`, "")}; TIMEFRAME=${screenshot.chart.timeframe}]`,
    });
  }
  parts.push({
    text: `${buildSystemPrompt(threshold)}\n\n${buildUserPrompt(threshold)}`,
  });

  const request = () =>
    withConfiguredRateLimit(GEMINI_RATE_LIMIT, async () =>
      ai.models.generateContent({
        model: ANALYSIS_MODEL,
        contents: [{ role: "user", parts }],
        config: buildGenerationConfig(ANALYSIS_MODEL, 4000),
      }),
    );

  const result = await withRetry(request, {
    onRetry: (error, attempt, maxAttempts, delayMs) => {
      logger.warn(
        `  ! Gemini main analysis temporary error (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  void recordGeminiUsage(
    result as {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    },
    {
      model: ANALYSIS_MODEL,
      source: "chart",
    },
  );

  return result.text ?? "";
}

async function verifySetupWithClaude(
  setup: TradeSetup,
  chart: NonNullable<ReturnType<typeof findChartForPair>>,
): Promise<VerificationResult> {
  const ai = getClaudeClient();
  const verificationChart = await captureVerificationChartScreenshot(chart);
  const userPrompt = buildVerificationPrompt(setup);

  const request = () =>
    ai.messages.create({
      model: VERIFY_MODEL_CLAUDE,
      max_tokens: 300,
      temperature: 0.2,
      system: "You verify chart setups. Answer only with concise JSON.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: detectImageMimeType(verificationChart.buffer),
                data: verificationChart.buffer.toString("base64"),
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

  const result = await withRetry(request, {
    onRetry: (error, attempt, maxAttempts, delayMs) => {
      logger.warn(
        `  ! Claude verify temporary error for ${setup.pair} (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  void recordClaudeUsage(
    result as { usage?: { input_tokens?: number; output_tokens?: number } },
    {
      model: VERIFY_MODEL_CLAUDE,
      source: "chart",
    },
  );

  const cleaned = extractJsonObject(
    extractTextFromClaudeResponse(
      result as { content?: Array<{ type: string; text?: string }> },
    ),
  );
  const parsed = JSON.parse(cleaned) as Partial<{
    confirmed: boolean;
    confidence: number;
    comment: string;
  }>;
  return {
    confirmed: Boolean(parsed.confirmed),
    confidence: clampConfidence(parsed.confidence),
    comment: String(parsed.comment || ""),
    verifiedBy: VERIFY_MODEL_CLAUDE,
  };
}

export async function verifySetupWithGeminiModel(
  setup: TradeSetup,
  imageBuffer: Buffer,
  model: string,
  ai: GoogleGenAI = getClient(),
): Promise<VerificationResult> {
  const userPrompt = buildVerificationPrompt(setup);

  const request = () =>
    withConfiguredRateLimit(GEMINI_RATE_LIMIT, async () =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: detectImageMimeType(imageBuffer),
                  data: imageBuffer.toString("base64"),
                },
              },
              { text: userPrompt },
            ],
          },
        ],
        config: buildGenerationConfig(model, 500),
      }),
    );

  const result = await withRetry(request, {
    onRetry: (error, attempt, maxAttempts, delayMs) => {
      logger.warn(
        `  ! Gemini verify temporary error with ${model} for ${setup.pair} (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  void recordGeminiUsage(
    result as {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    },
    {
      model,
      source: "chart",
    },
  );

  const parsed = parseVerificationResponse(result.text ?? "");
  if (!parsed) {
    throw new Error(
      `Gemini verify parse failed for model ${model}. Raw: ${(result.text ?? "").slice(0, 300)}`,
    );
  }

  return {
    ...parsed,
    verifiedBy: model,
  };
}

async function verifySetupWithGemini(
  setup: TradeSetup,
  chart: NonNullable<ReturnType<typeof findChartForPair>>,
): Promise<VerificationResult> {
  const verificationChart = await captureVerificationChartScreenshot(chart);

  try {
    return await verifySetupWithGeminiModel(
      setup,
      verificationChart.buffer,
      VERIFY_MODEL_PRIMARY,
    );
  } catch (primaryError) {
    logger.warn(
      `  ! Gemini verify failed with ${VERIFY_MODEL_PRIMARY} for ${setup.pair}, falling back to ${VERIFY_MODEL_CLAUDE}: ${
        primaryError instanceof Error ? primaryError.message : primaryError
      }`,
    );
    return await verifySetupWithClaude(setup, chart);
  }
}

/**
 * Re-checks high-confidence setups against the configured verify provider independently,
 * one chart at a time, so a single bad pair can't sink the rest.
 */
export async function confirmHighConfidenceSetups(
  setups: TradeSetup[],
  screenshots: ScreenshotResult[],
): Promise<TradeSetup[]> {
  const result: TradeSetup[] = [];

  for (const setup of setups) {
    const chart = findChartForPair(setup.pair, "H4");
    const screenshot = chart
      ? screenshots.find(
          (s) =>
            s.chart.symbol === chart.symbol &&
            (!s.chart.timeframe || s.chart.timeframe === "H4"),
        )
      : undefined;
    if (!screenshot || !chart) {
      result.push(setup);
      continue;
    }

    try {
      logger.info(
        `  -> Verifying ${setup.pair} with ${VERIFY_MODEL_PRIMARY} (fallback ${VERIFY_MODEL_CLAUDE})...`,
      );
      const verification = await verifySetupWithGemini(setup, chart);
      logger.info(
        `  ${verification.confirmed ? "✓" : "✗"} ${setup.pair}: ${verification.verifiedBy} ${
          verification.confirmed ? "confirmed" : "rejected"
        } (${verification.confidence}%) - ${verification.comment}`,
      );
      result.push({
        ...setup,
        verifiedConfirmed: verification.confirmed,
        verifiedConfidence: verification.confidence,
        verifiedComment: verification.comment,
        verifiedBy: verification.verifiedBy,
      });
    } catch (error) {
      logger.warn(
        `  ! Verify failed for ${setup.pair}: ${error instanceof Error ? error.message : error}`,
      );
      result.push(setup);
    }
  }

  return result;
}

export async function analyzeAllCharts(
  screenshots: ScreenshotResult[],
): Promise<AnalysisResult> {
  const threshold = getConfiguredChartSignalConfidenceThreshold();
  const groupedScreenshots = groupScreenshotsByPair(screenshots);
  const useNoSetupReasonPrefix = groupedScreenshots.length > 1;
  logger.info(`  -> Trying ${ANALYSIS_MODEL} per pair...`, {
    pairs: groupedScreenshots.length,
  });

  const summaries: PairSummary[] = [];
  const setups: TradeSetup[] = [];
  const noSetupReasons: string[] = [];
  const failedPairs: string[] = [];

  for (const group of groupedScreenshots) {
    try {
      logger.info(`  -> Analyzing ${group.pair} with ${ANALYSIS_MODEL}...`);
      const rawResponse = await analyzeWithGemini(group.screenshots);
      const parsed = parseAnalysisResponse(rawResponse);
      summaries.push(...parsed.summaries);
      setups.push(...parsed.setups);
      if (parsed.noSetupReason.trim()) {
        noSetupReasons.push(
          useNoSetupReasonPrefix
            ? `[${group.pair}] ${parsed.noSetupReason.trim()}`
            : parsed.noSetupReason.trim(),
        );
      }
      logger.info(`  ✓ Analyzed ${group.pair} by ${ANALYSIS_MODEL}`);
    } catch (error) {
      failedPairs.push(group.pair);
      logger.warn(
        `  ! Gemini main analysis failed for ${group.pair} (${group.screenshots.length} screenshots): ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  if (summaries.length === 0 && setups.length === 0) {
    throw new Error(
      failedPairs.length > 0
        ? `Gemini main analysis failed for all pairs: ${failedPairs.join(", ")}`
        : "Gemini main analysis returned no usable results.",
    );
  }

  const useTimeframeFilter = screenshots.every((s) =>
    Boolean(s.chart.timeframe),
  );
  const availableTimeframes = new Map<string, Set<string>>();
  for (const screenshot of screenshots) {
    const pair = getPairName(screenshot);
    const timeframes = availableTimeframes.get(pair) ?? new Set<string>();
    timeframes.add(screenshot.chart.timeframe);
    availableTimeframes.set(pair, timeframes);
  }
  const confluenceSetups = useTimeframeFilter
    ? setups.filter((setup) => {
        const timeframes = availableTimeframes.get(setup.pair);
        return (
          timeframes &&
          ["D1", "H4", "M15"].every((timeframe) => timeframes.has(timeframe))
        );
      })
    : setups;
  const noSetupReason = noSetupReasons.join("\n").trim();
  logger.info(
    `  ✓ ${summaries.length} pairs scanned, ${confluenceSetups.length} complete multi-timeframe setup(s) >=${threshold}% confidence`,
  );

  return { summaries, setups: confluenceSetups, noSetupReason, screenshots };
}
