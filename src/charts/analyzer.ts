import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult, PairSummary, ScreenshotResult, TradeSetup } from "../shared/types.js";
import { extractTextFromClaudeResponse, getClaudeClient } from "../shared/claude.js";
import { withRetry } from "../shared/retry.js";
import { captureVerificationChartScreenshot, findChartForPair } from "./screenshot.js";
import { getVerifyProvider, getVerifyProviderLabel } from "./verify-provider.js";

const SYSTEM_PROMPT = `Act as a professional price action trader who follows Bob Volman's methodology ("Understanding Price Action") and exclusively analyzes H4 charts with EMA 20. For each instrument provided, deliver a structured report comprising the following sections:

1. Trend Context - State whether the market is trending up, down, or ranging, describe price relation to EMA 20 (above/below/crossing), and assess EMA 20's slope.
2. EMA 20 Proximity (Primary Factor) - Quantify distance between price and EMA 20, classify proximity (at EMA, near within 2%, far above 2%), note any pullback or buildup/doji touches increasing confidence, and highlight that if price is far with no pullback, the guidance is to refrain from trading despite other patterns.
3. Support/Resistance - Identify nearby S/R levels, round numbers, or accumulation zones being tested or broken.
4. Volman's 7 Setups - Evaluate presence of RB, BB, ARB, FB, SB, DD, IRB patterns relative to EMA 20, indicating which setup is developing and its alignment with current trend.
5. Three or More Reasons Not to Trade - List specific concerns (e.g. false break risk, lack of buildup, flat EMA, rejection candles, choppiness, price distant from EMA) that argue against entering.
6. Conclusion - Recommend TRADE or NO TRADE, include a confidence percentage, and justify decision. If confidence is below 70%, conclude NO TRADE. Emphasize that only clear setups should trigger entries and urge waiting for pullbacks to EMA 20 before chasing breakouts.

Ensure each section is concise, factual, and consistent with the stated rules (EMA proximities prioritized, pullbacks preferred, no chasing distant breakouts).`;

const USER_PROMPT = `Analyze all attached H4 charts. Return only JSON with two keys: summaries and setups. In summaries include every pair with trend, emaProximity (tại/gần/xa EMA 20), status, and confidence. In setups include only setups with confidence >=70%; include pair, direction, setup description, emaTouch (true if price at EMA 20), reasons array, risks array, confidence, entry, stopLoss, takeProfit1, takeProfit2, riskReward, and summary. Provide specific price levels from the chart for entry, stopLoss, and takeProfits. Ensure status and setup descriptions reflect actual chart conditions, and omit any surrounding text.`;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenAI({ apiKey });
}

function cleanResponse(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

function extractJsonObject(text: string): string {
  const cleaned = cleanResponse(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function clampConfidence(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function parseAnalysisResponse(text: string): { summaries: PairSummary[]; setups: TradeSetup[]; noSetupReason: string } {
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

async function analyzeWithGemini(screenshots: ScreenshotResult[]): Promise<string> {
  const ai = getClient();
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  for (const screenshot of screenshots) {
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: screenshot.buffer.toString("base64") },
    });
    parts.push({ text: `[${screenshot.chart.name}]` });
  }
  parts.push({ text: SYSTEM_PROMPT + "\n\n" + USER_PROMPT });

  const request = () =>
    ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts }],
    });

  const result = await withRetry(request, {
    onRetry: (error, attempt, maxAttempts, delayMs) => {
      console.warn(
        `  ! Gemini main analysis temporary error (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  return result.text ?? "";
}

async function verifySetupWithClaude(
  setup: TradeSetup,
  chart: NonNullable<ReturnType<typeof findChartForPair>>,
): Promise<{ confirmed: boolean; confidence: number; comment: string }> {
  const ai = getClaudeClient();
  const verificationChart = await captureVerificationChartScreenshot(chart);

  const userPrompt = `Check this H4 EMA20 setup against the attached chart.

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
                media_type: "image/jpeg",
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
      console.warn(
        `  ! Claude verify temporary error for ${setup.pair} (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  const cleaned = extractJsonObject(
    extractTextFromClaudeResponse(result as { content?: Array<{ type: string; text?: string }> }),
  );
  const parsed = JSON.parse(cleaned) as Partial<{ confirmed: boolean; confidence: number; comment: string }>;
  return {
    confirmed: Boolean(parsed.confirmed),
    confidence: clampConfidence(parsed.confidence),
    comment: String(parsed.comment || ""),
  };
}

async function verifySetupWithGemini(
  setup: TradeSetup,
  chart: NonNullable<ReturnType<typeof findChartForPair>>,
): Promise<{ confirmed: boolean; confidence: number; comment: string }> {
  const ai = getClient();
  const verificationChart = await captureVerificationChartScreenshot(chart);

  const userPrompt = `Check this H4 EMA20 setup against the attached chart.

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

  const request = () =>
    ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: verificationChart.buffer.toString("base64"),
              },
            },
            { text: userPrompt },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 500,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

  const result = await withRetry(request, {
    onRetry: (error, attempt, maxAttempts, delayMs) => {
      console.warn(
        `  ! Gemini verify temporary error for ${setup.pair} (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  const cleaned = extractJsonObject(result.text ?? "");
  const parsed = JSON.parse(cleaned) as Partial<{ confirmed: boolean; confidence: number; comment: string }>;
  return {
    confirmed: Boolean(parsed.confirmed),
    confidence: clampConfidence(parsed.confidence),
    comment: String(parsed.comment || ""),
  };
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
    const chart = findChartForPair(setup.pair);
    const screenshot = chart ? screenshots.find((s) => s.chart.symbol === chart.symbol) : undefined;
    if (!screenshot || !chart) {
      result.push(setup);
      continue;
    }

    try {
      const provider = getVerifyProvider();
      const providerLabel = getVerifyProviderLabel(provider);
      console.log(`  -> Verifying ${setup.pair} with ${providerLabel}...`);
      const verification =
        provider === "claude"
          ? await verifySetupWithClaude(setup, chart)
          : await verifySetupWithGemini(setup, chart);
      console.log(
        `  ${verification.confirmed ? "✓" : "✗"} ${setup.pair}: ${providerLabel} ${
          verification.confirmed ? "confirmed" : "rejected"
        } (${verification.confidence}%) - ${verification.comment}`,
      );
      result.push({
        ...setup,
        verifiedConfirmed: verification.confirmed,
        verifiedConfidence: verification.confidence,
        verifiedComment: verification.comment,
      });
    } catch (error) {
      console.warn(`  ! Verify failed for ${setup.pair}: ${error instanceof Error ? error.message : error}`);
      result.push(setup);
    }
  }

  return result;
}

export async function analyzeAllCharts(screenshots: ScreenshotResult[]): Promise<AnalysisResult> {
  console.log("  -> Trying Gemini 3.5 Flash...");
  const rawResponse = await analyzeWithGemini(screenshots);
  console.log("  ✓ Analyzed by Gemini 3.5 Flash");

  const { summaries, setups, noSetupReason } = parseAnalysisResponse(rawResponse);
  console.log(`  ✓ ${summaries.length} pairs scanned, ${setups.length} setup(s) >=70% confidence`);

  return { summaries, setups, noSetupReason, screenshots };
}
