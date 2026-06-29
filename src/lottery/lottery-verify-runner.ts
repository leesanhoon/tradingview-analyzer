import { fetchActualRecords } from "./lottery-scraper.js";
import { appendWeekdayHistory } from "./lottery-repository.js";
import { matchPrizeLabel } from "./lottery-format.js";
import { loadUnverifiedPredictions, markPredictionVerified } from "./lottery-predictions-repository.js";
import { WEEKDAY_LABELS } from "./lottery-schedule.js";
import { sendMessage } from "../shared/telegram.js";
import type { LotteryRegion } from "./lottery-types.js";

const REGION_LABELS: Record<LotteryRegion, string> = {
  "mien-bac": "🟦 Miền Bắc",
  "mien-trung": "🟨 Miền Trung",
  "mien-nam": "🟩 Miền Nam",
};

function vnToday(): { dateStr: string; weekday: number } {
  const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  return { dateStr: vnNow.toISOString().slice(0, 10), weekday: vnNow.getDay() };
}

/** Xác minh các dự đoán đã lưu của 1 miền/hôm nay bằng kết quả scrape thật, lưu luôn vào `lottery_draws`, báo Telegram. */
export async function runLotteryVerify(region: LotteryRegion): Promise<void> {
  const { dateStr, weekday } = vnToday();
  const weekdayLabel = WEEKDAY_LABELS[weekday];
  console.log(`🔍 Lottery Verify [${region}] — ${weekdayLabel} ${dateStr}\n`);

  const predictions = await loadUnverifiedPredictions(dateStr, region);
  if (predictions.length === 0) {
    console.log("✓ Không có dự đoán nào cần xác minh hôm nay.");
    await sendMessage(`🔍 *DÒ KẾT QUẢ* — ${REGION_LABELS[region]}\n📅 ${weekdayLabel}, ${dateStr}\n\nKhông có dự đoán nào để xác minh hôm nay.`);
    return;
  }

  const actualRecords = await fetchActualRecords(region, dateStr, weekday);
  if (actualRecords.length === 0) {
    console.log("✓ Chưa có kết quả thật hôm nay — bỏ qua, lần chạy sau (theo lịch) sẽ thử lại.");
    await sendMessage(
      `🔍 *DÒ KẾT QUẢ* — ${REGION_LABELS[region]}\n📅 ${weekdayLabel}, ${dateStr}\n\n⏳ Chưa có kết quả quay số hôm nay trên xoso.com.vn — thử lại sau.`,
    );
    return;
  }

  await appendWeekdayHistory(weekday, actualRecords);
  console.log(`✓ Đã lưu ${actualRecords.length} bản ghi kết quả thật vào lottery_draws.`);

  const lines: string[] = [`🔍 *DÒ KẾT QUẢ* — ${REGION_LABELS[region]}`, `📅 ${weekdayLabel}, ${dateStr}`, ""];
  let hitCount = 0;

  for (const prediction of predictions) {
    let matchedProvince: string | undefined;
    let matchedPrize: string | undefined;

    for (const record of actualRecords) {
      const label = matchPrizeLabel(record.prizes, prediction.number);
      if (label) {
        matchedProvince = record.province;
        matchedPrize = label;
        break;
      }
    }

    const hit = matchedPrize !== undefined;
    await markPredictionVerified(dateStr, region, prediction.number, hit, matchedProvince, matchedPrize);
    if (hit) hitCount++;

    const detail = hit ? `✅ TRÚNG${matchedPrize ? ` — ${matchedPrize}` : ""}${matchedProvince ? ` (${matchedProvince})` : ""}` : "❌ Không trúng";
    lines.push(`#${prediction.rank} \`${prediction.number}\`  —  ${detail}`);
    console.log(`✓ [${prediction.number}] ${hit ? "TRÚNG" : "không trúng"}`);
  }

  lines.push("");
  lines.push(`*Tổng kết: trúng ${hitCount}/${predictions.length}*`);
  await sendMessage(lines.join("\n"));
  console.log(`\n✅ Hoàn tất. Trúng ${hitCount}/${predictions.length}.`);
}
