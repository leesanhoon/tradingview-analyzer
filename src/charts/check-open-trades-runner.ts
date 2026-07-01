import { captureVerificationChartScreenshot, findChartForPair } from "./screenshot.js";
import { closePosition, loadOpenPositions, updatePositionDecision } from "./positions-repository.js";
import { decidePosition } from "./position-decision.js";
import { buildPositionDecisionMessage, sendMessage, sendPhoto } from "../shared/telegram.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("charts:check-open-trades");

function formatCheckedAt(): string {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

async function processPosition(position: Awaited<ReturnType<typeof loadOpenPositions>>[number]): Promise<void> {
  const chart = findChartForPair(position.pair);
  if (!chart) {
    logger.warn("No chart configuration found", { pair: position.pair });
    return;
  }

  const screenshot = await captureVerificationChartScreenshot(chart);
  await sendPhoto(screenshot.buffer, `📊 ${position.pair} - kiểm tra vị thế`);

  const decision = await decidePosition(position, screenshot);
  await updatePositionDecision(position.id, decision.decision, decision.confidence, decision.comment);
  if (decision.decision === "CLOSE" || decision.decision === "STOP") {
    await closePosition(position.id);
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


