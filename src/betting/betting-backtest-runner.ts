import "../shared/env.js";
import { fetchFixtureResult } from "./betting-api.js";
import { loadBettingAnalysisSnapshots } from "./betting-analysis-repository.js";
import { runBettingBacktest } from "./betting-backtest.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("betting:betting-backtest");

async function main(): Promise<void> {
  logger.info("Betting backtest starting");
  const snapshots = await loadBettingAnalysisSnapshots();
  if (snapshots.length === 0) {
    logger.info("No betting analysis snapshots found");
    return;
  }

  const results = [];
  for (const snapshot of snapshots) {
    const result = await fetchFixtureResult(snapshot.gameId);
    if (result) results.push(result);
  }

  const report = runBettingBacktest(snapshots, results);
  logger.info("Betting backtest complete", {
    evaluated: report.evaluated,
    hitRate: report.hitRate,
    averageScoreConfidence: report.averageScoreConfidence,
  });

  logger.info(
    [
      "Betting backtest",
      `Evaluated: ${report.evaluated}`,
      `Exact-score hit rate: ${report.hitRate}%`,
      `Average score confidence: ${report.averageScoreConfidence}%`,
    ].join("\n"),
  );
}

main().catch((error) => {
  logger.error("Fatal error", { error });
  process.exit(1);
});
