import type { LotteryDrawRecord, LotteryRegion } from "./lottery-types.js";
import { WEEKDAY_LABELS } from "./lottery-schedule.js";

export type LotteryDataset = {
  weekdayLabel: string;
  region: LotteryRegion;
  generatedAt: string;
  recordCount: number;
  history: LotteryDrawRecord[];
};

/** Đóng gói dataset đúng-thứ-hôm-nay, riêng cho 1 miền. */
export function buildLotteryDataset(weekday: number, region: LotteryRegion, records: LotteryDrawRecord[]): LotteryDataset {
  return {
    weekdayLabel: WEEKDAY_LABELS[weekday],
    region,
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    history: records,
  };
}

export function lotteryFilename(weekday: number, dateStr: string, region: LotteryRegion): string {
  const [y, m, d] = dateStr.split("-");
  const label = weekday === 0 ? "cn" : `thu-${weekday + 1}`;
  return `${label}_${d}-${m}-${y}_${region}.json`;
}
