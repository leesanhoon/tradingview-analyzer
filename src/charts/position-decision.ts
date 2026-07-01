import { GoogleGenAI } from "@google/genai";
import type { ScreenshotResult } from "../shared/types.js";
import { getClaudeClient, extractTextFromClaudeResponse } from "../shared/claude.js";
import { withRetry } from "../shared/retry.js";
import type { OpenPosition } from "./positions-repository.js";
import { getVerifyProvider } from "./verify-provider.js";
import { createLogger } from "../shared/logger.js";
import { withConfiguredRateLimit } from "../shared/rate-limit.js";
import type { PositionDecisionOutcome } from "./position-engine.js";
import { recordClaudeUsage, recordGeminiUsage } from "../shared/ai-usage.js";

const logger = createLogger("charts:position-decision");
const GEMINI_RATE_LIMIT = {
  key: "gemini",
  envVar: "GEMINI_RATE_LIMIT_RPM",
  defaultRpm: 15,
};
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }
  return new GoogleGenAI({ apiKey });
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

  if (model !== "gemini-2.5-pro") {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
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

export function parseDecisionResponse(text: string): PositionDecisionOutcome | null {
  const cleaned = extractJsonObject(text);
  try {
    const parsed = JSON.parse(cleaned) as Partial<PositionDecisionOutcome> & {
      managementAction?: string;
      partialClosePercent?: number;
      newStopLoss?: string;
      tp1Reached?: boolean;
      tp2Reached?: boolean;
    };
    const decision: PositionDecisionOutcome["decision"] =
      parsed.decision === "CLOSE" || parsed.decision === "STOP" ? parsed.decision : "HOLD";
    const tp1Reached = Boolean(parsed.tp1Reached);
    const tp2Reached = Boolean(parsed.tp2Reached);
    const managementAction: PositionDecisionOutcome["managementAction"] =
      parsed.managementAction === "PARTIAL_TP1" ||
      parsed.managementAction === "MOVE_SL_TO_BE" ||
      parsed.managementAction === "TRAIL_SL" ||
      parsed.managementAction === "TP2_CLOSE"
        ? parsed.managementAction
        : tp2Reached
          ? "TP2_CLOSE"
          : tp1Reached
            ? "PARTIAL_TP1"
            : "NONE";

    return {
      decision,
      confidence: clampConfidence(parsed.confidence),
      comment: String(parsed.comment || ""),
      managementAction,
      partialClosePercent: Math.max(
        0,
        Math.min(100, Math.round(Number(parsed.partialClosePercent ?? (managementAction === "PARTIAL_TP1" ? 50 : 0)))),
      ),
      newStopLoss: parsed.newStopLoss ? String(parsed.newStopLoss) : null,
      tp1Reached,
      tp2Reached,
      riskReward: parsed.riskReward === undefined ? null : Number(parsed.riskReward),
      tp1RiskReward: parsed.tp1RiskReward === undefined ? null : Number(parsed.tp1RiskReward),
      tp2RiskReward: parsed.tp2RiskReward === undefined ? null : Number(parsed.tp2RiskReward),
    };
  } catch {
    return null;
  }
}

async function decidePositionWithClaude(
  position: OpenPosition,
  screenshot: ScreenshotResult,
): Promise<PositionDecisionOutcome> {
  const ai = getClaudeClient();

  const prompt = `Review the current chart and the open trade below.

Trade:
- Pair: ${position.pair}
- Direction: ${position.direction}
- Setup: ${position.setup ?? ""}
- Entry: ${position.entry}
- Stop loss: ${position.stopLoss}
- Take profit 1: ${position.takeProfit1}
- Take profit 2: ${position.takeProfit2 ?? ""}
- Reasons: ${(position.reasons ?? []).slice(0, 4).join(" | ")}

Return only JSON with keys decision, managementAction, partialClosePercent, newStopLoss, confidence, comment.
decision must be one of HOLD, CLOSE, STOP.
managementAction must be one of NONE, PARTIAL_TP1, MOVE_SL_TO_BE, TRAIL_SL, TP2_CLOSE.
If TP1 is reached, use PARTIAL_TP1 and set partialClosePercent to 50 unless a different configured partial close is justified.
If TP2 is reached, use decision CLOSE and managementAction TP2_CLOSE.
Comment should be short and practical.`;

  const request = () =>
    ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      temperature: 0.2,
      system: "You manage open trades from chart evidence. Answer only with concise JSON.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: screenshot.buffer.toString("base64"),
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

  const response = await withRetry(request, {
    onRetry: (error, attempt, maxAttempts, delayMs) => {
      logger.warn(
        `  ! Claude position decision temporary error for ${position.pair} (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  void recordClaudeUsage(response as { usage?: { input_tokens?: number; output_tokens?: number } }, {
    model: "claude-sonnet-4-6",
    source: "chart",
  });

  const parsed = parseDecisionResponse(extractTextFromClaudeResponse(response as { content?: Array<{ type: string; text?: string }> }));
  if (!parsed) {
    throw new Error("Claude position decision parse failed");
  }
  return parsed;
}

async function decidePositionWithGemini(
  position: OpenPosition,
  screenshot: ScreenshotResult,
): Promise<PositionDecisionOutcome> {
  const ai = getClient();
  const model = "gemini-2.5-pro";

  const prompt = `Review the current chart and the open trade below.

Trade:
- Pair: ${position.pair}
- Direction: ${position.direction}
- Setup: ${position.setup ?? ""}
- Entry: ${position.entry}
- Stop loss: ${position.stopLoss}
- Take profit 1: ${position.takeProfit1}
- Take profit 2: ${position.takeProfit2 ?? ""}
- Reasons: ${(position.reasons ?? []).slice(0, 4).join(" | ")}

Return only JSON with keys decision, managementAction, partialClosePercent, newStopLoss, confidence, comment.
decision must be one of HOLD, CLOSE, STOP.
managementAction must be one of NONE, PARTIAL_TP1, MOVE_SL_TO_BE, TRAIL_SL, TP2_CLOSE.
If TP1 is reached, use PARTIAL_TP1 and set partialClosePercent to 50 unless a different configured partial close is justified.
If TP2 is reached, use decision CLOSE and managementAction TP2_CLOSE.
Comment should be short and practical.`;

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
                  mimeType: "image/jpeg",
                  data: screenshot.buffer.toString("base64"),
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: buildGenerationConfig(model, 300),
      }),
    );

  const response = await withRetry(request, {
    onRetry: (error, attempt, maxAttempts, delayMs) => {
      logger.warn(
        `  ! Gemini position decision temporary error for ${position.pair} (${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : error
        }`,
      );
    },
  });

  void recordGeminiUsage(
    response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } },
    {
      model,
      source: "chart",
    },
  );

  const parsed = parseDecisionResponse(response.text ?? "");
  if (!parsed) {
    throw new Error(`Gemini position decision parse failed for model ${model}. Raw: ${(response.text ?? "").slice(0, 300)}`);
  }
  return parsed;
}

export async function decidePosition(
  position: OpenPosition,
  screenshot: ScreenshotResult,
): Promise<PositionDecisionOutcome> {
  const provider = getVerifyProvider();
  return provider === "claude"
    ? decidePositionWithClaude(position, screenshot)
    : decidePositionWithGemini(position, screenshot);
}

export { decidePositionWithClaude };


