import { fetchActualRecords } from "./lottery-scraper.js";
import { loadWeekdayHistory } from "./lottery-repository.js";
import { predictTopNumbers } from "./lottery-predict.js";
import { savePredictions } from "./lottery-predictions-repository.js";
import { WEEKDAY_LABELS } from "./lottery-schedule.js";
import { sendMessage } from "../shared/telegram.js";
import type { LotteryRegion } from "./lottery-types.js";

const REGIONS: LotteryRegion[] = ["mien-nam", "mien-trung", "mien-bac"];
const REGION_LABELS: Record<LotteryRegion, string> = {
  "mien-bac": "🟦 Miền Bắc",
  "mien-trung": "🟨 Miền Trung",
  "mien-nam": "🟩 Miền Nam",
};

/** Ngày/thứ ở offset ngày so với hôm nay, theo giờ Asia/Ho_Chi_Minh (cùng pattern đã dùng ở lottery-runner.ts). */
function vnDateOffset(offsetDays: number): { dateStr: string; weekday: number } {
  const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  vnNow.setDate(vnNow.getDate() + offsetDays);
  return { dateStr: vnNow.toISOString().slice(0, 10), weekday: vnNow.getDay() };
}

/** Đã có kết quả thật hôm nay của miền này chưa — kiểm tra trực tiếp bằng scrape, không đoán theo giờ cố định
 * (giờ quay xong thực tế dao động mỗi ngày, đoán bằng giờ cố định dễ sai như đã gặp với Miền Nam). */
async function hasDrawnToday(region: LotteryRegion, dateStr: string, weekday: number): Promise<boolean> {
  try {
    const records = await fetchActualRecords(region, dateStr, weekday);
    return records.length > 0;
  } catch {
    return false;
  }
}

/** Ngày/thứ mục tiêu của 1 miền — nếu hôm nay miền đó đã có kết quả thật rồi thì dự đoán cho ngày mai. */
async function targetForRegion(region: LotteryRegion, today: { dateStr: string; weekday: number }): Promise<{ dateStr: string; weekday: number }> {
  const alreadyDrawnToday = await hasDrawnToday(region, today.dateStr, today.weekday);
  return alreadyDrawnToday ? vnDateOffset(1) : today;
}

function overdueIcon(overdueRatio: number): string {
  if (overdueRatio > 1.3) return "🔥";
  if (overdueRatio > 1) return "⏳";
  return "✨";
}

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

/** Phân tích thống kê + hồi quy tuyến tính, dự đoán top 3 số dễ ra mỗi miền — mỗi miền tự tính đúng ngày/thứ mục tiêu (hôm nay hoặc ngày mai nếu đã quay xong). */
export async function runLotteryPredict(): Promise<void> {
  const today = vnDateOffset(0);
  console.log(`🔮 Lottery Predictor — chạy ngày ${today.dateStr} (${WEEKDAY_LABELS[today.weekday]})\n`);

  const historyCache = new Map<number, Awaited<ReturnType<typeof loadWeekdayHistory>>>();
  const historyForWeekday = async (weekday: number) => {
    let history = historyCache.get(weekday);
    if (!history) {
      history = await loadWeekdayHistory(weekday);
      historyCache.set(weekday, history);
    }
    return history;
  };

  const lines: string[] = ["🔮 *DỰ ĐOÁN XỔ SỐ*", ""];
  let anyPrediction = false;

  for (const region of REGIONS) {
    const target = await targetForRegion(region, today);
    const weekdayLabel = WEEKDAY_LABELS[target.weekday];
    const history = await historyForWeekday(target.weekday);
    const recordsForRegion = history.filter((r) => r.region === region);
    if (recordsForRegion.length === 0) {
      console.log(`✗ [${region}] Chưa có dữ liệu lịch sử cho ${weekdayLabel} — bỏ qua.`);
      continue;
    }

    const periodCount = new Set(recordsForRegion.map((r) => r.date)).size;
    const predictions = predictTopNumbers(recordsForRegion, region, 3);
    await savePredictions(target.dateStr, target.weekday, region, predictions);
    anyPrediction = true;

    lines.push("━━━━━━━━━━━━━━━");
    lines.push(`${REGION_LABELS[region]} — ${weekdayLabel}, ${target.dateStr}`);
    lines.push(`_(${periodCount} kỳ ${weekdayLabel.toLowerCase()} đã thống kê)_`);
    lines.push("");
    predictions.forEach((p, i) => {
      const gapNote = p.gap > 0 ? `chưa ra lại sau ${p.gap} kỳ` : "vừa ra ở kỳ liền trước";
      lines.push(`${RANK_MEDAL[i] ?? "▫️"} \`${p.number}\`  —  ${(p.freq * 100).toFixed(1)}% xác suất  ${overdueIcon(p.overdueRatio)} _(lịch sử ra gần nhất: ${gapNote})_`);
    });
    lines.push("");
    console.log(`✓ [${region}] Top ${predictions.length} số dự đoán cho ${weekdayLabel} ${target.dateStr} từ ${periodCount} kỳ.`);
  }

  if (!anyPrediction) {
    await sendMessage("🔮 *DỰ ĐOÁN XỔ SỐ*\n\n❌ Chưa có dữ liệu lịch sử cho miền/ngày nào — bỏ qua.");
    console.log("✓ Không có dữ liệu để dự đoán.");
    return;
  }

  lines.push("━━━━━━━━━━━━━━━");
  lines.push("⚠️ _Chỉ mang tính tham khảo thống kê, xổ số là ngẫu nhiên._");
  await sendMessage(lines.join("\n"));
  console.log("\n✅ Hoàn tất.");
}
