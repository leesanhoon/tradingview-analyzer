import "../shared/env.js";
import { captureAllCharts } from "./screenshot.js";
import { analyzeAllCharts, confirmHighConfidenceSetups } from "./analyzer.js";
import { saveOpenPosition } from "./positions-repository.js";
import { runCheckOpenTrades } from "./check-open-trades-runner.js";
import { sendAllAnalyses, notifyError } from "../shared/telegram.js";
import { createLogger } from "../shared/logger.js";
import { validateTradeSetupForOpen } from "./position-engine.js";
import { getConfiguredChartSignalConfidenceThreshold } from "./chart-config-env.js";

const logger = createLogger("charts:index");
const CHART_VERIFY_MODEL_PRIMARY =
  process.env.CHART_VERIFY_MODEL_PRIMARY?.trim() || "gemini-2.5-pro";
const CHART_VERIFY_MODEL_CLAUDE =
  process.env.CHART_VERIFY_MODEL_CLAUDE?.trim() || "claude-sonnet-4-6";
const CHART_ANALYSIS_MODEL =
  process.env.CHART_ANALYSIS_MODEL?.trim() || "gemini-3.5-flash";

async function main(): Promise<void> {
  const startTime = Date.now();
  logger.info("Bob Volman multi-timeframe scanner starting");

  logger.info("Capturing all forex charts", {
    intervals: ["D1", "H4", "M15"],
    indicators: ["EMA 20", "volume"],
  });
  const screenshots = await captureAllCharts();

  if (screenshots.length === 0) {
    throw new Error("No charts captured.");
  }
  logger.info("Captured charts", { count: screenshots.length });

  logger.info("Analyzing charts", { model: CHART_ANALYSIS_MODEL });
  const result = await analyzeAllCharts(screenshots);
  logger.info("Analysis complete");

  const threshold = getConfiguredChartSignalConfidenceThreshold();
  const highConfSetups = result.setups.filter(
    (s) => (s.confidence ?? 0) > threshold,
  );
  if (highConfSetups.length > 0) {
    logger.info("Verifying high-confidence setups", {
      count: highConfSetups.length,
      primaryModel: CHART_VERIFY_MODEL_PRIMARY,
      fallbackModel: CHART_VERIFY_MODEL_CLAUDE,
    });
    const verified = await confirmHighConfidenceSetups(
      highConfSetups,
      screenshots,
    );
    const verifiedByPair = new Map(verified.map((s) => [s.pair, s]));
    result.setups = result.setups.map((s) => verifiedByPair.get(s.pair) ?? s);
    logger.info("Verification complete");
  }

  for (const setup of result.setups) {
    if (setup.verifiedConfirmed === true) {
      try {
        const validation = validateTradeSetupForOpen(setup);
        if (!validation.accepted) {
          logger.info("Skipped open position due to risk/reward gate", {
            pair: setup.pair,
            reason: validation.reason,
          });
          continue;
        }

        const saved = await saveOpenPosition(setup);
        if (saved) {
          setup.autoTracked = true;
          logger.info("Auto-saved open position", { pair: setup.pair });
        } else {
          logger.info("Skipped duplicate open position", { pair: setup.pair });
        }
      } catch (error) {
        logger.error("Failed to auto-save open position", {
          pair: setup.pair,
          error,
        });
      }
    }
  }

  logger.info("Sending results to Telegram");
  await sendAllAnalyses(result);

  logger.info("Checking open positions");
  await runCheckOpenTrades();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info("Run complete", {
    scannedPairs: screenshots.length,
    elapsedSeconds: Number(elapsed),
  });
}

main().catch(async (error) => {
  logger.error("Fatal error", { error });
  await notifyError("Bob Volman multi-timeframe scanner", error);
  process.exit(1);
});
