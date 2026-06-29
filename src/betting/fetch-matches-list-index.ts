import "../shared/env.js";
import { fetchFixtures } from "./betting-api.js";
import { extractMatches } from "./betting.js";
import { saveMatches } from "./match-repository.js";
import { notifyError } from "../shared/telegram.js";
import type { MatchInfo } from "./betting-types.js";

const DAYS_AHEAD = 2;

/** API-Football lọc `date=` theo ngày UTC của họ, không phải giờ VN (UTC+7) — nên 1 ngày VN
 *  có thể trải qua 2 ngày UTC (đêm VN tràn sang ngày UTC kế tiếp). Query thêm dư 1 ngày UTC ở
 *  đầu để chắc chắn không bỏ sót trận khuya VN; phần thừa/ngoài DAYS_AHEAD sẽ tự bị `saveMatches`
 *  prune hoặc đơn giản là dữ liệu dư không gây hại. */
function utcDateOffsetStr(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Entry point riêng — chỉ refresh lịch thi đấu (không đụng odds/Telegram).
 * Chạy theo cron riêng (mỗi ngày), lấy fixtures của 2 ngày sắp tới và lưu hẳn vào DB
 * (không phải cache tạm 1 ngày) để luồng lấy odds có thể tra cứu lịch các ngày sau.
 */
async function main(): Promise<void> {
  console.log(`📡 Fetch Matches List — Starting (${DAYS_AHEAD} ngày tới)...\n`);

  const allMatches: MatchInfo[] = [];
  for (let offset = -1; offset < DAYS_AHEAD; offset++) {
    const dateStr = utcDateOffsetStr(offset);
    const raw = await fetchFixtures(dateStr);
    const matches = extractMatches(raw);
    allMatches.push(...matches);
    console.log(`  ✓ UTC ${dateStr}: ${matches.length} trận`);
  }

  await saveMatches(allMatches);

  const byDate = new Map<string, number>();
  for (const m of allMatches) byDate.set(m.date, (byDate.get(m.date) ?? 0) + 1);
  console.log(`\n✓ ${allMatches.length} trận đấu (đã lưu DB), theo ngày VN:`);
  for (const [date, count] of [...byDate.entries()].sort()) console.log(`  - ${date}: ${count} trận`);
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  await notifyError("Fetch Matches List", error);
  process.exit(1);
});
