import { describe, expect, test } from "vitest";
import { runForexBacktest } from "../../src/charts/forex-backtest.js";

describe("charts/forex-backtest", () => {
  test("summarizes direction and entry accuracy from closed positions", () => {
    const report = runForexBacktest([
      {
        id: 1,
        pair: "EUR/USD",
        direction: "LONG",
        entry: "1.1000",
        stopLoss: "1.0960",
        takeProfit1: "1.1080",
        takeProfit2: "1.1120",
        status: "closed",
        closedAt: "2026-07-01T00:00:00.000Z",
        tp1ClosedPercent: 50,
        trailingStopLoss: "1.1000",
        riskRewardRatio: 2.5,
        tp1RiskRewardRatio: 2,
        tp2RiskRewardRatio: 3,
        lastManagementAction: "NONE",
        realizedRiskRewardRatio: 1,
        realizedExitPrice: "1.1000",
        closeReason: "manual_close",
      },
      {
        id: 2,
        pair: "GBP/USD",
        direction: "SHORT",
        entry: "1.2500",
        stopLoss: "1.2540",
        takeProfit1: "1.2420",
        takeProfit2: "1.2380",
        status: "closed",
        closedAt: "2026-07-02T00:00:00.000Z",
        tp1ClosedPercent: 0,
        trailingStopLoss: "1.2540",
        riskRewardRatio: 3,
        tp1RiskRewardRatio: 2,
        tp2RiskRewardRatio: 3,
        lastManagementAction: "NONE",
        realizedRiskRewardRatio: -1,
        realizedExitPrice: "1.2540",
        closeReason: "stop_loss",
      },
    ]);

    expect(report.trades).toBe(2);
    expect(report.directionAccuracy).toBe(50);
    expect(report.entryHitRate).toBe(50);
    expect(report.averageRealizedRiskReward).toBe(0);
    expect(report.byPair).toHaveLength(2);
  });
});
