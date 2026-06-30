import { beforeEach, describe, expect, test, vi } from "vitest";

const analyzerState = vi.hoisted(() => ({
  generateContent: vi.fn(),
  claudeCreate: vi.fn(),
  retry: vi.fn(async (request: () => Promise<unknown>) => request()),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: analyzerState.generateContent };
    constructor(_options: unknown) {}
  },
}));

vi.mock("../../src/shared/retry.js", () => ({
  withRetry: analyzerState.retry,
}));

vi.mock("../../src/charts/screenshot.js", () => ({
  captureVerificationChartScreenshot: vi.fn(async (chart: { symbol: string; name: string }) => ({
    chart,
    buffer: Buffer.from(`chart-${chart.symbol}`),
    filepath: `/tmp/${chart.symbol}.jpg`,
  })),
  findChartForPair: vi.fn((pair: string) => (pair === "EUR/USD" ? { symbol: "EURUSD", name: "EUR/USD" } : undefined)),
}));

vi.mock("../../src/shared/claude.js", () => ({
  extractTextFromClaudeResponse: (response: { content?: Array<{ type: string; text?: string }> }) =>
    response.content?.map((block) => block.text ?? "").join("") ?? "",
  getClaudeClient: () => ({
    messages: { create: analyzerState.claudeCreate },
  }),
}));

const analyzer = await import("../../src/charts/analyzer.js");

describe("charts/analyzer", () => {
  beforeEach(() => {
    analyzerState.generateContent.mockReset();
    analyzerState.claudeCreate.mockReset();
    analyzerState.retry.mockClear();
    process.env.GEMINI_API_KEY = "test";
    process.env.ANTHROPIC_API_KEY = "test";
  });

  test("parseAnalysisResponse filters low-confidence setups", () => {
    const parsed = analyzer.parseAnalysisResponse(
      '{"summaries":[{"pair":"EUR/USD","trend":"Up","status":"Trade","confidence":81}],"setups":[{"pair":"EUR/USD","direction":"LONG","setup":"Breakout","reasons":["A"],"risks":["B"],"confidence":72,"entry":"1.10","stopLoss":"1.09","takeProfit1":"1.12","takeProfit2":"1.13","riskReward":"1:2","summary":"ok"},{"pair":"GBP/USD","direction":"SHORT","setup":"Reversal","reasons":["C"],"risks":["D"],"confidence":69,"entry":"1.25","stopLoss":"1.26","takeProfit1":"1.23","takeProfit2":"1.22","riskReward":"1:2","summary":"skip"}],"noSetupReason":"none"}',
    );

    expect(parsed.summaries).toHaveLength(1);
    expect(parsed.setups).toHaveLength(1);
    expect(parsed.setups[0].pair).toBe("EUR/USD");
    expect(parsed.noSetupReason).toBe("none");
  });

  test("analyzeAllCharts returns parsed AI output and preserves screenshots", async () => {
    analyzerState.generateContent.mockResolvedValueOnce({
      text: "```json\n{\"summaries\":[{\"pair\":\"EUR/USD\",\"trend\":\"Up\",\"emaProximity\":\"gần\",\"status\":\"TRADE\",\"confidence\":88}],\"setups\":[{\"pair\":\"EUR/USD\",\"direction\":\"LONG\",\"setup\":\"Pullback\",\"emaTouch\":true,\"reasons\":[\"EMA touch\"],\"risks\":[\"False breakout\"],\"confidence\":78,\"entry\":\"1.1000\",\"stopLoss\":\"1.0960\",\"takeProfit1\":\"1.1080\",\"takeProfit2\":\"1.1120\",\"riskReward\":\"1:2\",\"summary\":\"Valid long\"},{\"pair\":\"GBP/USD\",\"direction\":\"SHORT\",\"setup\":\"Weak setup\",\"reasons\":[\"Chop\"],\"risks\":[\"Noise\"],\"confidence\":63,\"entry\":\"1.2500\",\"stopLoss\":\"1.2540\",\"takeProfit1\":\"1.2420\",\"takeProfit2\":\"1.2380\",\"riskReward\":\"1:2\",\"summary\":\"Skip\"}],\"noSetupReason\":\"No clean setup\"}\n```",
    });

    const screenshots = [
      { chart: { symbol: "EURUSD", name: "EUR/USD" }, buffer: Buffer.from("one"), filepath: "/tmp/eur.jpg" },
    ];

    const result = await analyzer.analyzeAllCharts(screenshots);

    expect(result.summaries).toHaveLength(1);
    expect(result.setups).toHaveLength(1);
    expect(result.setups[0].pair).toBe("EUR/USD");
    expect(result.noSetupReason).toBe("No clean setup");
    expect(result.screenshots).toBe(screenshots);
    expect(analyzerState.generateContent).toHaveBeenCalledTimes(1);
  });

  test("confirmHighConfidenceSetups annotates verified setups and leaves unmatched ones untouched", async () => {
    analyzerState.generateContent.mockResolvedValueOnce({
      text: '{"confirmed":true,"confidence":91,"comment":"aligned"}',
    });

    const setups = [
      {
        pair: "EUR/USD",
        direction: "LONG" as const,
        setup: "Pullback",
        emaTouch: true,
        reasons: ["EMA touch", "Trend aligned"],
        risks: ["News risk"],
        confidence: 84,
        entry: "1.1000",
        stopLoss: "1.0960",
        takeProfit1: "1.1080",
        takeProfit2: "1.1120",
        riskReward: "1:2",
        summary: "Valid long",
      },
      {
        pair: "AUD/USD",
        direction: "SHORT" as const,
        setup: "Fade",
        reasons: ["Resistance"],
        risks: ["Bounce"],
        confidence: 88,
        entry: "0.6800",
        stopLoss: "0.6840",
        takeProfit1: "0.6720",
        takeProfit2: "0.6680",
        riskReward: "1:2",
        summary: "Another setup",
      },
    ];

    const result = await analyzer.confirmHighConfidenceSetups(setups, [
      { chart: { symbol: "EURUSD", name: "EUR/USD" }, buffer: Buffer.from("eur"), filepath: "/tmp/eur.jpg" },
    ]);

    expect(result[0]).toMatchObject({
      verifiedConfirmed: true,
      verifiedConfidence: 91,
      verifiedComment: "aligned",
      verifiedBy: "gemini-2.5-pro",
    });
    expect(result[1]).toEqual(setups[1]);
    expect(analyzerState.generateContent).toHaveBeenCalledTimes(1);
  });
});
