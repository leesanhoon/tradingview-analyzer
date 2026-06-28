import fs from "fs";
import path from "path";
import { appendWeekdayHistory } from "./lottery-cache.js";
import type { LotteryDrawRecord, LotteryHistoryFile } from "./lottery-types.js";

const OLD_FILE = path.join(process.cwd(), "data", "lottery-history.json");

function main(): void {
  if (!fs.existsSync(OLD_FILE)) {
    console.log("✓ Không có file cache cũ (data/lottery-history.json) — không cần migrate.");
    return;
  }

  const raw = fs.readFileSync(OLD_FILE, "utf-8");
  const parsed = JSON.parse(raw) as LotteryHistoryFile;
  const records = parsed.records ?? [];
  console.log(`📦 Đọc được ${records.length} bản ghi từ file cache cũ.`);

  const byWeekday = new Map<number, LotteryDrawRecord[]>();
  for (const record of records) {
    const group = byWeekday.get(record.weekday) ?? [];
    group.push(record);
    byWeekday.set(record.weekday, group);
  }

  for (const [weekday, group] of byWeekday) {
    appendWeekdayHistory(weekday, group);
    console.log(`✓ Thứ ${weekday}: ghi ${group.length} bản ghi vào data/lottery-t${weekday}.json`);
  }

  console.log(`\n✅ Migrate hoàn tất. Có thể xoá file cũ: ${OLD_FILE}`);
}

main();
