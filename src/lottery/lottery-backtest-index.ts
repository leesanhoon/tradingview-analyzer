import "../shared/env.js";
import { loadWeekdayHistory } from "./lottery-repository.js";
import { runBacktest } from "./lottery-backtest.js";
import { WEEKDAY_LABELS } from "./lottery-schedule.js";
import type { LotteryRegion } from "./lottery-types.js";

const REGIONS: LotteryRegion[] = ["mien-bac", "mien-trung", "mien-nam"];

async function main(): Promise<void> {
  console.log("🧪 Lottery Backtest — walk-forward validation top-3 mỗi miền/thứ\n");
  console.log("Miền        Thứ        Kỳ test   Hit-rate   Baseline   Edge");
  console.log("-".repeat(70));

  for (let weekday = 0; weekday < 7; weekday++) {
    const history = await loadWeekdayHistory(weekday);
    if (history.length === 0) continue;

    for (const region of REGIONS) {
      const recordsForRegion = history.filter((r) => r.region === region);
      if (recordsForRegion.length === 0) continue;

      const report = runBacktest(recordsForRegion, region, 3, 20);
      if (report.periodsTested === 0) continue;

      const row = [
        region.padEnd(11),
        WEEKDAY_LABELS[weekday].padEnd(10),
        String(report.periodsTested).padEnd(9),
        `${(report.hitRate * 100).toFixed(1)}%`.padEnd(10),
        `${(report.baselineHitRate * 100).toFixed(1)}%`.padEnd(10),
        `${report.edge >= 0 ? "+" : ""}${(report.edge * 100).toFixed(1)}%`,
      ].join(" ");
      console.log(row);
    }
  }

  console.log("\n✅ Hoàn tất. Edge dương nghĩa là model hit nhiều hơn baseline ngẫu nhiên.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
