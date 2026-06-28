import type { LotteryDrawRecord, LotteryRegion } from "./lottery-types.js";
import { WEEKDAY_LABELS } from "./lottery-schedule.js";

export type LotteryDataset = {
  weekdayLabel: string;
  generatedAt: string;
  recordCount: number;
  /** Gộp cả 3 miền, mỗi record giữ nguyên field gọn (date, region, province, prizes). */
  history: LotteryDrawRecord[];
};

/** Đóng gói dataset đúng-thứ-hôm-nay, gộp cả 3 miền vào 1 object JSON duy nhất. */
export function buildLotteryDataset(weekday: number, records: LotteryDrawRecord[]): LotteryDataset {
  return {
    weekdayLabel: WEEKDAY_LABELS[weekday],
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    history: records,
  };
}

export function lotteryFilename(weekday: number, dateStr: string): string {
  return `loto_t${weekday}_${dateStr}.json`;
}
