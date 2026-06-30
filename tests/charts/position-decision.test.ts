import { beforeEach, describe, expect, test, vi } from "vitest";

const positionState = vi.hoisted(() => ({
  provider: "gemini" as "gemini" | "claude",
  generateContent: vi.fn(),
  claudeCreate: vi.fn(),
  retry: vi.fn(async (request: () => Promise<unknown>) => request()),
}));

vi.mock("../../src/charts/verify-provider.js", () => ({
  getVerifyProvider: () => positionState.provider,
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: positionState.generateContent };
    constructor(_options: unknown) {}
  },
}));

vi.mock("../../src/shared/retry.js", () => ({
  withRetry: positionState.retry,
}));

vi.mock("../../src/shared/claude.js", () => ({
  extractTextFromClaudeResponse: (response: { content?: Array<{ type: string; text?: string }> }) =>
    response.content?.map((block) => block.text ?? "").join("") ?? "",
  getClaudeClient: () => ({
    messages: { create: positionState.claudeCreate },
  }),
}));

const positionDecision = await import("../../src/charts/position-decision.js");

describe("charts/position-decision", () => {
  beforeEach(() => {
    positionState.provider = "gemini";
    positionState.generateContent.mockReset();
    positionState.claudeCreate.mockReset();
    positionState.retry.mockClear();
    process.env.GEMINI_API_KEY = "test";
    process.env.ANTHROPIC_API_KEY = "test";
  });

  test("parseDecisionResponse normalizes malformed decisions to HOLD", () => {
    expect(positionDecision.parseDecisionResponse('{"decision":"WAIT","confidence":"abc","comment":"unclear"}')).toEqual({
      decision: "HOLD",
      confidence: 0,
      comment: "unclear",
    });
  });

  test("decidePosition uses Gemini output when provider is gemini", async () => {
    positionState.generateContent.mockResolvedValueOnce({
      text: '{"decision":"CLOSE","confidence":87,"comment":"Trend failed"}',
    });

    const result = await positionDecision.decidePosition(
      {
        id: 1,
        pair: "EUR/USD",
        direction: "LONG",
        setup: "Breakout",
        entry: "1.1000",
        stopLoss: "1.0960",
        takeProfit1: "1.1080",
        takeProfit2: "1.1120",
        reasons: ["Trend broke"],
        openedAt: "2026-07-01T00:00:00.000Z",
        status: "open",
        lastDecision: null,
        lastDecisionConfidence: null,
        lastDecisionComment: null,
        lastCheckedAt: null,
        closedAt: null,
      },
      { chart: { symbol: "EURUSD", name: "EUR/USD" }, buffer: Buffer.from("chart"), filepath: "/tmp/chart.jpg" },
    );

    expect(result).toEqual({
      decision: "CLOSE",
      confidence: 87,
      comment: "Trend failed",
    });
    expect(positionState.generateContent).toHaveBeenCalledTimes(1);
  });

  test("decidePosition falls back to Claude when provider is claude", async () => {
    positionState.provider = "claude";
    positionState.claudeCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"decision":"STOP","confidence":94,"comment":"Invalidated"}' }],
    });

    const result = await positionDecision.decidePosition(
      {
        id: 2,
        pair: "GBP/USD",
        direction: "SHORT",
        setup: null,
        entry: "1.2500",
        stopLoss: "1.2540",
        takeProfit1: "1.2420",
        takeProfit2: null,
        reasons: null,
        openedAt: "2026-07-01T00:00:00.000Z",
        status: "open",
        lastDecision: null,
        lastDecisionConfidence: null,
        lastDecisionComment: null,
        lastCheckedAt: null,
        closedAt: null,
      },
      { chart: { symbol: "GBPUSD", name: "GBP/USD" }, buffer: Buffer.from("chart"), filepath: "/tmp/chart.jpg" },
    );

    expect(result).toEqual({
      decision: "STOP",
      confidence: 94,
      comment: "Invalidated",
    });
    expect(positionState.claudeCreate).toHaveBeenCalledTimes(1);
  });
});
