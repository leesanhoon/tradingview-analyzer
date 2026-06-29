import { extractNums } from "./lottery-format.js";
import type { LotteryDrawRecord, LotteryRegion } from "./lottery-types.js";

/**
 * Tốc độ suy giảm trọng số theo kỳ, riêng theo miền — chọn qua grid-search backtest per-region
 * (miền Bắc 1 đài/kỳ nên đặc tính khác hẳn miền Trung/Nam nhiều đài/kỳ, không nên dùng chung 1 hằng số).
 */
export const DECAY_BY_REGION: Record<LotteryRegion, number> = {
  "mien-bac": 0.95,
  "mien-trung": 0.9,
  "mien-nam": 0.93,
};

/** Hệ số cộng điểm cho số đang "quá hạn" so với gap kỳ vọng — chỉ cộng, không trừ số mới ra. */
export const OVERDUE_BONUS = 0.3;

export type NumberPrediction = {
  number: string;
  /** Xác suất thống kê thô: số lần xuất hiện / tổng số kỳ. */
  freq: number;
  /** Tần suất có trọng số suy giảm theo thời gian (kỳ gần đây quan trọng hơn) — ổn định hơn OLS slope. */
  weightedFreq: number;
  /** Số kỳ liên tiếp gần nhất chưa xuất hiện. */
  gap: number;
  /** gap / gap kỳ vọng (1/freq) — > 1 nghĩa là đang trễ hạn so với kỳ vọng thống kê. */
  overdueRatio: number;
  score: number;
};

/**
 * Dự đoán top N số 3 chữ số dễ xuất hiện nhất, dựa trên lịch sử 1 miền, đúng 1 thứ trong tuần.
 * Kết hợp 2 tín hiệu: weightedFreq (EWMA — số đang "nóng" gần đây) và overdueRatio (gap analysis —
 * số đã lâu chưa ra so với gap kỳ vọng dưới giả định xác suất không đổi).
 */
export function predictTopNumbers(records: LotteryDrawRecord[], region: LotteryRegion, topN = 10): NumberPrediction[] {
  const dates = [...new Set(records.map((r) => r.date))].sort();
  const periodIndex = new Map(dates.map((date, i) => [date, i]));
  const periodCount = dates.length;
  if (periodCount === 0) return [];

  const occurrences = new Map<string, Set<number>>();
  for (const record of records) {
    const periodIdx = periodIndex.get(record.date)!;
    for (const num of extractNums(record.prizes)) {
      const periods = occurrences.get(num) ?? new Set<number>();
      periods.add(periodIdx);
      occurrences.set(num, periods);
    }
  }

  // Trọng số suy giảm theo "tuổi" của kỳ (kỳ cuối cùng = tuổi 0), tính sẵn tổng để chuẩn hoá weightedFreq về [0,1].
  const decay = DECAY_BY_REGION[region];
  const weightByPeriod = dates.map((_, i) => decay ** (periodCount - 1 - i));
  const totalWeight = weightByPeriod.reduce((sum, w) => sum + w, 0);

  const predictions: NumberPrediction[] = [];
  for (const [number, periods] of occurrences) {
    const freq = periods.size / periodCount;

    let weightedSum = 0;
    let lastSeen = -1;
    for (const periodIdx of periods) {
      weightedSum += weightByPeriod[periodIdx];
      if (periodIdx > lastSeen) lastSeen = periodIdx;
    }
    const weightedFreq = weightedSum / totalWeight;

    const gap = periodCount - 1 - lastSeen;
    const expectedGap = freq > 0 ? 1 / freq : periodCount;
    const overdueRatio = gap / expectedGap;

    const score = weightedFreq * (1 + OVERDUE_BONUS * Math.max(0, overdueRatio - 1));
    predictions.push({ number, freq, weightedFreq, gap, overdueRatio, score });
  }

  predictions.sort((a, b) => b.score - a.score);
  return predictions.slice(0, topN);
}
