import { captureVerificationChartScreenshot, findChartForPair } from "./screenshot.js";
import { closePosition, loadOpenPositions, updatePositionDecision } from "./positions-repository.js";
import { decidePosition } from "./position-decision.js";
import { buildPositionDecisionMessage, sendMessage, sendPhoto } from "../shared/telegram.js";

function formatCheckedAt(): string {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

async function processPosition(position: Awaited<ReturnType<typeof loadOpenPositions>>[number]): Promise<void> {
  const chart = findChartForPair(position.pair);
  if (!chart) {
    console.warn(`⚠️ Không tìm thấy cấu hình chart cho ${position.pair}`);
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
  console.log("🔎 Check Open Trades - bắt đầu...");
  const positions = await loadOpenPositions();
  if (positions.length === 0) {
    console.log("✓ Không có vị thế nào đang mở.");
    return;
  }

  console.log(`✓ Đã tải ${positions.length} vị thế đang mở.`);

  for (const position of positions) {
    try {
      console.log(`→ Đang kiểm tra #${position.id} ${position.pair}...`);
      await processPosition(position);
      console.log(`✓ Đã xong #${position.id} ${position.pair}`);
    } catch (error) {
      console.error(`✗ Lỗi #${position.id} ${position.pair}:`, error);
      await sendMessage(
        `⚠️ *Check Open Trades*\n\nKhông thể kiểm tra vị thế #${position.id} ${position.pair}:\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log("✓ Hoàn tất.");
}
