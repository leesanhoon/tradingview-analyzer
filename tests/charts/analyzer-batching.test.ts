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

describe("charts/analyzer batching", () => {
  beforeEach(() => {
    analyzerState.generateContent.mockReset();
    analyzerState.claudeCreate.mockReset();
    analyzerState.retry.mockClear();
    process.env.GEMINI_API_KEY = "test";
    process.env.ANTHROPIC_API_KEY = "test";
  });

  test("analyzeAllCharts continues when one pair fails and merges successful pairs", async () => {
    analyzerState.generateContent
      .mockResolvedValueOnce({
        text: "```json\n{\"summaries\":[{\"pair\":\"EUR/USD\",\"trend\":\"Up\",\"emaProximity\":\"gần\",\"status\":\"TRADE\",\"confidence\":88}],\"setups\":[{\"pair\":\"EUR/USD\",\"direction\":\"LONG\",\"setup\":\"Pullback\",\"emaTouch\":true,\"reasons\":[\"EMA touch\"],\"risks\":[\"False breakout\"],\"confidence\":78,\"entry\":\"1.1000\",\"stopLoss\":\"1.0960\",\"takeProfit1\":\"1.1080\",\"takeProfit2\":\"1.1120\",\"riskReward\":\"1:2\",\"summary\":\"Valid long\"}],\"noSetupReason\":\"EUR clean\"}\n```",
      })
      .mockRejectedValueOnce(new Error("503 UNAVAILABLE"));

    const screenshots = [
      { chart: { symbol: "EURUSD", name: "EUR/USD D1", timeframe: "D1" }, buffer: Buffer.from("one"), filepath: "/tmp/eur-d1.jpg" },
      { chart: { symbol: "EURUSD", name: "EUR/USD H4", timeframe: "H4" }, buffer: Buffer.from("two"), filepath: "/tmp/eur-h4.jpg" },
      { chart: { symbol: "EURUSD", name: "EUR/USD M15", timeframe: "M15" }, buffer: Buffer.from("three"), filepath: "/tmp/eur-m15.jpg" },
      { chart: { symbol: "GBPUSD", name: "GBP/USD D1", timeframe: "D1" }, buffer: Buffer.from("four"), filepath: "/tmp/gbp-d1.jpg" },
      { chart: { symbol: "GBPUSD", name: "GBP/USD H4", timeframe: "H4" }, buffer: Buffer.from("five"), filepath: "/tmp/gbp-h4.jpg" },
      { chart: { symbol: "GBPUSD", name: "GBP/USD M15", timeframe: "M15" }, buffer: Buffer.from("six"), filepath: "/tmp/gbp-m15.jpg" },
    ];

    const result = await analyzer.analyzeAllCharts(screenshots);

    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].pair).toBe("EUR/USD");
    expect(result.setups).toHaveLength(1);
    expect(result.setups[0].pair).toBe("EUR/USD");
    expect(result.noSetupReason).toContain("[EUR/USD] EUR clean");
    expect(result.noSetupReason).not.toContain("GBP/USD");
    expect(analyzerState.generateContent).toHaveBeenCalledTimes(2);
  });
});
