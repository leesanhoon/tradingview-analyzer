import { getDb } from "../shared/db.js";
import type { NumberPrediction } from "./lottery-predict.js";
import type { LotteryRegion } from "./lottery-types.js";

export type PredictionRow = {
  date: string;
  weekday: number;
  region: LotteryRegion;
  number: string;
  rank: number;
};

/** Lưu lại top N dự đoán của 1 miền/ngày vào `lottery_predictions` (upsert, dedup theo date+region+number). */
export async function savePredictions(
  date: string,
  weekday: number,
  region: LotteryRegion,
  predictions: NumberPrediction[],
): Promise<void> {
  if (predictions.length === 0) return;

  const rows = predictions.map((p, i) => ({
    date,
    weekday,
    region,
    number: p.number,
    rank: i + 1,
    freq: p.freq,
    weighted_freq: p.weightedFreq,
    gap: p.gap,
    overdue_ratio: p.overdueRatio,
    score: p.score,
  }));

  const { error } = await (getDb().from("lottery_predictions") as any).upsert(rows, { onConflict: "date,region,number" });
  if (error) throw new Error(`savePredictions upsert failed: ${error.message}`);
}

/** Lấy các dự đoán chưa được xác minh (`verified_at is null`) của đúng ngày + miền. */
export async function loadUnverifiedPredictions(date: string, region: LotteryRegion): Promise<PredictionRow[]> {
  const { data, error } = await (getDb().from("lottery_predictions") as any)
    .select("date, weekday, region, number, rank")
    .eq("date", date)
    .eq("region", region)
    .is("verified_at", null)
    .order("rank", { ascending: true });
  if (error || !data) return [];
  return data as PredictionRow[];
}

/** Đánh dấu 1 dự đoán đã được xác minh, kèm kết quả trúng/không trúng. */
export async function markPredictionVerified(
  date: string,
  region: LotteryRegion,
  number: string,
  hit: boolean,
  matchedProvince?: string,
  matchedPrize?: string,
): Promise<void> {
  const { error } = await (getDb().from("lottery_predictions") as any)
    .update({
      verified_at: new Date().toISOString(),
      hit,
      matched_province: matchedProvince ?? null,
      matched_prize: matchedPrize ?? null,
    })
    .eq("date", date)
    .eq("region", region)
    .eq("number", number);
  if (error) throw new Error(`markPredictionVerified update failed: ${error.message}`);
}
