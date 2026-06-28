import fs from "fs";
import path from "path";
import type { LotteryDrawRecord, LotteryHistoryFile } from "./lottery-types.js";

const DATA_DIR = path.join(process.cwd(), "data");

/** Giữ lịch sử ~13 tháng/file để đủ mẫu cho thống kê, không quá phình theo thời gian. */
const HISTORY_RETENTION_DAYS = 400;

function weekdayFilePath(weekday: number): string {
  return path.join(DATA_DIR, `lottery-t${weekday}.json`);
}

const LAST_SENT_FILE = path.join(DATA_DIR, "lottery-last-sent.json");

/** "YYYY-MM-DD" của lần gửi Telegram gần nhất, hoặc null nếu chưa từng gửi. */
export function getLastSentDate(): string | null {
  try {
    const raw = fs.readFileSync(LAST_SENT_FILE, "utf-8");
    return (JSON.parse(raw) as { dateStr: string }).dateStr ?? null;
  } catch {
    return null;
  }
}

export function setLastSentDate(dateStr: string): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LAST_SENT_FILE, JSON.stringify({ dateStr }), "utf-8");
}

/** Đọc toàn bộ lịch sử (cả 3 miền) của đúng 1 thứ trong tuần. */
export function loadWeekdayHistory(weekday: number): LotteryDrawRecord[] {
  try {
    const raw = fs.readFileSync(weekdayFilePath(weekday), "utf-8");
    const parsed = JSON.parse(raw) as LotteryHistoryFile;
    return parsed.records ?? [];
  } catch {
    return [];
  }
}

function saveWeekdayHistory(weekday: number, records: LotteryDrawRecord[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(weekdayFilePath(weekday), JSON.stringify({ records } satisfies LotteryHistoryFile, null, 2), "utf-8");
}

/**
 * Append bản ghi mới vào ĐÚNG file của thứ tương ứng (không đụng 6 file khác), dedup theo
 * (date, region, province), rồi prune bản ghi quá cũ. `weekday` của các bản ghi phải khớp
 * tham số `weekday` — caller chịu trách nhiệm tách đúng nhóm trước khi gọi.
 */
export function appendWeekdayHistory(weekday: number, newRecords: LotteryDrawRecord[], now: number = Date.now()): void {
  if (newRecords.length === 0) return;

  const existing = loadWeekdayHistory(weekday);
  const key = (r: LotteryDrawRecord) => `${r.date}|${r.region}|${r.province}`;
  const existingKeys = new Set(existing.map(key));
  const merged = [...existing, ...newRecords.filter((r) => !existingKeys.has(key(r)))];

  const cutoff = now - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pruned = merged.filter((r) => new Date(`${r.date}T00:00:00+07:00`).getTime() >= cutoff);

  saveWeekdayHistory(weekday, pruned);
}
