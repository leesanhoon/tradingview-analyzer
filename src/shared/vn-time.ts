const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

/**
 * Lấy ngày + giờ theo giờ VN từ 1 thời điểm UTC, đọc trực tiếp qua Intl.DateTimeFormat
 * (không round-trip qua `new Date(string)`) — vì cách đó chỉ đúng khi máy chạy ở giờ UTC;
 * trên máy có timezone = giờ VN, round-trip bị double-apply offset và cho sai ngày gần nửa đêm.
 */
function vnParts(unixMs: number): { year: string; month: string; day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(unixMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") === "24" ? "00" : get("hour"), minute: get("minute") };
}

/** "YYYY-MM-DD" theo giờ VN. */
export function vnDateStr(unixMs: number): string {
  const p = vnParts(unixMs);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:mm" theo giờ VN. */
export function vnTimeStr(unixMs: number): string {
  const p = vnParts(unixMs);
  return `${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DD" của ngày hôm nay (hoặc +offsetDays) theo giờ VN. */
export function vnDateOffsetStr(offsetDays: number = 0, now: number = Date.now()): string {
  return vnDateStr(now + offsetDays * 24 * 60 * 60 * 1000);
}
