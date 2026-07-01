import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult, PairSummary, ScreenshotResult, TradeSetup } from "./chart-types.js";
import { extractTextFromClaudeResponse, getClaudeClient } from "../shared/claude.js";
import { withRetry } from "../shared/retry.js";
import { captureVerificationChartScreenshot, findChartForPair } from "./screenshot.js";
import { createLogger } from "../shared/logger.js";
import { withConfiguredRateLimit } from "../shared/rate-limit.js";
import { recordClaudeUsage, recordGeminiUsage } from "../shared/ai-usage.js";

const logger = createLogger("charts:analyzer");
const VERIFY_MODEL_PRIMARY = "gemini-2.5-pro";
const ANALYSIS_MODEL = "gemini-3.5-flash";
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

const SYSTEM_PROMPT = `Act as a professional price-action trader using Bob Volman's methodology, EMA 20, and volume.

Analyze each instrument as one multi-timeframe package:
- D1 establishes the dominant trend and major support/resistance.
- H4 identifies the Volman setup (RB, BB, ARB, FB, SB, DD, or IRB) and is the primary decision timeframe.
- M15 refines entry timing and rejects entries with noisy, contradictory price action.
- Volume must confirm a breakout or rejection. Treat weak or declining volume as a risk, never as confirmation.

Only recommend TRADE when D1 and H4 direction agree, M15 does not contradict them, price is at or near H4 EMA 20 or has a clean buildup, and volume supports the move. Missing timeframes, conflicting trends, distant price without a pullback, flat EMA, weak volume, or poor risk/reward must reduce confidence. If fewer than two timeframes agree, or confidence is below 70%, conclude NO TRADE. Never invent unreadable price levels.`;

const USER_PROMPT = `Analyze the attached chart packages. Each image label contains pair and timeframe. Return only JSON with keys summaries, setups, and noSetupReason.

In summaries include every pair with pair, trend (describe D1/H4/M15 alignment), emaProximity (tại/gần/xa), status, and confidence.
In setups include only confluence setups with confidence >=70%; include pair, direction, setup, emaTouch, reasons, risks, confidence, entry, stopLoss, takeProfit1, takeProfit2, riskReward, and summary. Reasons must explicitly mention D1, H4, M15, and volume evidence. Provide levels from H4/M15. Omit surrounding text.`;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenAI({ apiKey });
}

export function cleanResponse(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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

export function parseAnalysisResponse(text: string): { summaries: PairSummary[]; setups: TradeSetup[]; noSetupReason: string } {
  const cleaned = extractJsonObject(text);
  try {
    const parsed = JSON.parse(cleaned) as Partial<{ summaries: PairSummary[]; setups: TradeSetup[]; noSetupReason: string }>;
    const setups = (parsed.setups || []).filter((s) => (s.confidence ?? 0) >= 70);
    return {
      summaries: parsed.summaries || [],
      setups,
      noSetupReason: parsed.noSetupReason || "",
    };
  } catch {
    return { summaries: [], setups: [], noSetupReason: "Failed to parse AI response. Raw: " + text.slice(0, 300) };
  }
}

function parseVerificationResponse(text: string): VerificationResult | null {
  const cleaned = extractJsonObject(text);

  try {
    const parsed = JSON.parse(cleaned) as { confirmed?: unknown; confidence?: unknown; comment?: unknown };
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

async function analyzeWithGemini(screenshots: ScreenshotResult[]): Promise<string> {
  const ai = getClient();
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  const orderedScreenshots = [...screenshots].sort((left, right) => {
    const pairOrder = left.chart.symbol.localeCompare(right.chart.symbol);
    if (pairOrder !== 0) return pairOrder;
    return ["D1", "H4", "M15"].indexOf(left.chart.timeframe) - ["D1", "H4", "M15"].indexOf(right.chart.timeframe);
  });
  for (const screenshot of orderedScreenshots) {
    parts.push({
      inlineData: { mimeType: detectImageMimeType(screenshot.buffer), data: screenshot.buffer.toString("base64") },
    });
    parts.push({ text: `[PAIR=${screenshot.chart.name.replace(` ${screenshot.chart.timeframe}`, "")}; TIMEFRAME=${screenshot.chart.timeframe}]` });
  }
  parts.push({ text: SYSTEM_PROMPT + "\n\n" + USER_PROMPT });

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
    result as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } },
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
      model: "claude-sonnet-4-6",
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

  void recordClaudeUsage(result as { usage?: { input_tokens?: number; output_tokens?: number } }, {
    model: "claude-sonnet-4-6",
    source: "chart",
  });

  const cleaned = extractJsonObject(
    extractTextFromClaudeResponse(result as { content?: Array<{ type: string; text?: string }> }),
  );
  const parsed = JSON.parse(cleaned) as Partial<{ confirmed: boolean; confidence: number; comment: string }>;
  return {
    confirmed: Boolean(parsed.confirmed),
    confidence: clampConfidence(parsed.confidence),
    comment: String(parsed.comment || ""),
    verifiedBy: "claude-sonnet-4-6",
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
    result as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } },
    {
      model,
      source: "chart",
    },
  );

  const parsed = parseVerificationResponse(result.text ?? "");
  if (!parsed) {
    throw new Error(`Gemini verify parse failed for model ${model}. Raw: ${(result.text ?? "").slice(0, 300)}`);
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
    return await verifySetupWithGeminiModel(setup, verificationChart.buffer, VERIFY_MODEL_PRIMARY);
  } catch (primaryError) {
    logger.warn(
      `  ! Gemini verify failed with ${VERIFY_MODEL_PRIMARY} for ${setup.pair}, falling back to Claude Sonnet 4.6: ${
        primaryError instanceof Error ? primaryError.message : primaryError
      }`,
    );
    return await verifySetupWithClaude(setup, chart);
  }
}

/**
 * Re-checks high-confidence (>80%) setups against the configured verify provider independently,
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
          (s) => s.chart.symbol === chart.symbol && (!s.chart.timeframe || s.chart.timeframe === "H4"),
        )
      : undefined;
    if (!screenshot || !chart) {
      result.push(setup);
      continue;
    }

    try {
      logger.info(`  -> Verifying ${setup.pair} with Gemini 2.5 Pro (fallback Claude Sonnet 4.6)...`);
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
      logger.warn(`  ! Verify failed for ${setup.pair}: ${error instanceof Error ? error.message : error}`);
      result.push(setup);
    }
  }

  return result;
}

export async function analyzeAllCharts(screenshots: ScreenshotResult[]): Promise<AnalysisResult> {
  logger.info("  -> Trying Gemini 3.5 Flash...");
  const rawResponse = await analyzeWithGemini(screenshots);
  logger.info("  ✓ Analyzed by Gemini 3.5 Flash");

  const { summaries, setups, noSetupReason } = parseAnalysisResponse(rawResponse);
  const usesMultiTimeframeInput = screenshots.some((s) => Boolean(s.chart.timeframe));
  const availableTimeframes = new Map<string, Set<string>>();
  for (const screenshot of screenshots) {
    const pair = screenshot.chart.name.replace(` ${screenshot.chart.timeframe}`, "");
    const timeframes = availableTimeframes.get(pair) ?? new Set<string>();
    timeframes.add(screenshot.chart.timeframe);
    availableTimeframes.set(pair, timeframes);
  }
  const confluenceSetups = usesMultiTimeframeInput
    ? setups.filter((setup) => {
        const timeframes = availableTimeframes.get(setup.pair);
        return timeframes && ["D1", "H4", "M15"].every((timeframe) => timeframes.has(timeframe));
      })
    : setups;
  logger.info(
    `  ✓ ${summaries.length} pairs scanned, ${confluenceSetups.length} complete multi-timeframe setup(s) >=70% confidence`,
  );

  return { summaries, setups: confluenceSetups, noSetupReason, screenshots };
}


