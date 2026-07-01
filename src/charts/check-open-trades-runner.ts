import { captureVerificationChartScreenshot, findChartForPair } from "./screenshot.js";
import { buildPositionManagementPatch, closePosition, loadOpenPositions, updatePositionDecision } from "./positions-repository.js";
import { decidePosition } from "./position-decision.js";
import { buildPositionDecisionMessage, sendMessage, sendPhoto } from "../shared/telegram.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("charts:check-open-trades");

function formatCheckedAt(): string {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

async function processPosition(position: Awaited<ReturnType<typeof loadOpenPositions>>[number]): Promise<void> {
  const chart = findChartForPair(position.pair, "H4");
  if (!chart) {
    logger.warn("No chart configuration found", { pair: position.pair });
    return;
  }

  const screenshot = await captureVerificationChartScreenshot(chart);
  await sendPhoto(screenshot.buffer, `📊 ${position.pair} - kiểm tra vị thế (${chart.timeframe})`);

  const decision = await decidePosition(position, screenshot);
  const { patch, closePosition: shouldClose } = buildPositionManagementPatch(position, decision);
  await updatePositionDecision(position.id, decision, patch);
  if (shouldClose) {
    await closePosition(position, decision, patch);
  }

  const message = buildPositionDecisionMessage(
    {
      id: position.id,
      pair: position.pair,
      direction: position.direction,
      setup: position.setup,
      entry: position.entry,
      stopLoss: position.stopLoss,
      takeProfit1: position.takeProfit1,
      takeProfit2: position.takeProfit2,
      reasons: position.reasons,
      openedAt: position.openedAt ? new Date(position.openedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : null,
      lastDecision: position.lastDecision,
      lastDecisionConfidence: position.lastDecisionConfidence,
      lastDecisionComment: position.lastDecisionComment,
      tradeStage: patch?.tradeStage ?? position.tradeStage,
      tp1ClosedPercent: patch?.tp1ClosedPercent ?? position.tp1ClosedPercent,
      trailingStopLoss: patch?.trailingStopLoss ?? position.trailingStopLoss,
    },
    decision,
  );

  await sendMessage(`${message}\n\n*Cập nhật lúc:* ${formatCheckedAt()}`);
}

export async function runCheckOpenTrades(): Promise<void> {
  logger.info("Check open trades starting");
  const positions = await loadOpenPositions();
  if (positions.length === 0) {
    logger.info("No open positions");
    return;
  }

  logger.info("Loaded open positions", { count: positions.length });

  for (const position of positions) {
    try {
      logger.info("Checking open position", { id: position.id, pair: position.pair });
      await processPosition(position);
      logger.info("Finished open position", { id: position.id, pair: position.pair });
    } catch (error) {
      logger.error("Failed to check open position", { id: position.id, pair: position.pair, error });
      await sendMessage(
        `⚠️ *Check Open Trades*\n\nKhông thể kiểm tra vị thế #${position.id} ${position.pair}:\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.info("Check open trades complete");
}
