import { fetchDayPage, parseWeekdayPage } from "./lottery-scraper.js";
import { appendWeekdayHistory, loadWeekdayHistory } from "./lottery-repository.js";
import { buildLotteryDataset, lotteryFilename } from "./lottery-format.js";
import { WEEKDAY_LABELS } from "./lottery-schedule.js";
import { sendDocument, sendMessage } from "../shared/telegram.js";
import type { LotteryDrawRecord, LotteryRegion } from "./lottery-types.js";

const REGIONS: LotteryRegion[] = ["mien-bac", "mien-trung", "mien-nam"];

function vnDateOffset(offsetDays: number): { dateStr: string; weekday: number } {
  const now = new Date();
  const vnNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  vnNow.setDate(vnNow.getDate() + offsetDays);
  return { dateStr: vnNow.toISOString().slice(0, 10), weekday: vnNow.getDay() };
}

/**
 * Chạy lúc 19h: (1) lấy + append kết quả THẬT của hôm nay vào file đúng thứ hôm nay (giữ cache
 * luôn mới — bỏ qua fetch nếu hôm nay đã có sẵn, tránh request thừa khi chạy tay nhiều lần), và
 * (2) gửi Telegram file của NGÀY MAI (thứ kế tiếp) — để có sẵn lịch sử các lần thứ đó trước đây,
 * dùng phân tích/dự đoán TRƯỚC khi kỳ quay ngày mai diễn ra. 2 việc này độc lập.
 */
export async function runLotteryCheck(): Promise<void> {
  const today = vnDateOffset(0);
  const tomorrow = vnDateOffset(1);
  const todayLabel = WEEKDAY_LABELS[today.weekday];
  const tomorrowLabel = WEEKDAY_LABELS[tomorrow.weekday];
  console.log(`🎰 Lottery History Scanner — hôm nay ${todayLabel} ${today.dateStr}, chuẩn bị data cho ${tomorrowLabel} ${tomorrow.dateStr}\n`);

  const historyToday = await loadWeekdayHistory(today.weekday);
  const regionsAlreadyToday = new Set(historyToday.filter((r) => r.date === today.dateStr).map((r) => r.region));

  const todayRecords: LotteryDrawRecord[] = [];
  const failures: string[] = [];

  for (const region of REGIONS) {
    if (regionsAlreadyToday.has(region)) {
      console.log(`✓ [${region}] Đã có dữ liệu hôm nay (${today.dateStr}) — bỏ qua, không fetch lại.\n`);
      continue;
    }

    try {
      console.log(`📡 [${region}] Lấy kết quả hôm nay (${today.dateStr})...`);
      const html = await fetchDayPage(region, today.dateStr);
      const records = parseWeekdayPage(html, region, today.weekday).filter((r) => r.prizes.db !== "");
      todayRecords.push(...records);
      console.log(`✓ [${region}] Lấy được ${records.length} bản ghi.\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ [${region}] Lấy dữ liệu thất bại: ${message}\n`);
      failures.push(`${region}: ${message}`);
    }
  }

  if (failures.length > 0) {
    await sendMessage(`⚠️ [Lottery] Lấy dữ liệu hôm nay thất bại:\n${failures.join("\n").slice(0, 1000)}`);
  }

  await appendWeekdayHistory(today.weekday, todayRecords);

  const historyForTomorrow = await loadWeekdayHistory(tomorrow.weekday);
  if (historyForTomorrow.length === 0) {
    await sendMessage(`🎰 *Lottery History Scanner*\nChưa có dữ liệu lịch sử cho ${tomorrowLabel} (${tomorrow.dateStr}) — bỏ qua, không gửi file.`);
    console.log("\n✓ Không có dữ liệu để gửi.");
    return;
  }

  for (const region of REGIONS) {
    const recordsForRegion = historyForTomorrow.filter((r) => r.region === region);
    if (recordsForRegion.length === 0) continue;

    const dataset = buildLotteryDataset(tomorrow.weekday, region, recordsForRegion);
    const buffer = Buffer.from(JSON.stringify(dataset, null, 0));
    const filename = lotteryFilename(tomorrow.weekday, tomorrow.dateStr, region);
    await sendDocument(
      buffer,
      filename,
      `🎰 Chuẩn bị cho ${tomorrowLabel} ${tomorrow.dateStr} — ${region} (${recordsForRegion.length} kỳ tích lũy)`,
    );
    console.log(`✓ Đã gửi file ${filename} (${recordsForRegion.length} bản ghi, ${region}, cho ${tomorrowLabel}).`);
  }

  console.log("\n✅ Hoàn tất.");
}
