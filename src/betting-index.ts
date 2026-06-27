import "./env.js";
import { fetchGamesByChamp } from "./betting-api.js";
import { extractMatches, filterUpcomingWithin, buildOddsPayload } from "./betting.js";
import { sendMessage, sendDocument, notifyError } from "./telegram.js";

const HOURS_WINDOW = 12;

async function main(): Promise<void> {
  console.log("🏆 Match Odds Scanner — Starting...\n");

  console.log("📡 Lấy danh sách trận đấu...");
  const raw = await fetchGamesByChamp();
  const matches = extractMatches(raw);
  console.log(`✓ ${matches.length} trận đội tuyển quốc gia (đã loại placeholder)\n`);

  const upcoming = filterUpcomingWithin(matches, HOURS_WINDOW);
  console.log(`✓ ${upcoming.length} trận sắp đá trong ${HOURS_WINDOW}h tới\n`);

  if (upcoming.length === 0) {
    await sendMessage(`⏸ Không có trận đội tuyển quốc gia nào sắp đá trong ${HOURS_WINDOW}h tới.`);
    console.log("→ Không có trận nào. Đã gửi thông báo.");
    return;
  }

  console.log("📊 Lấy dữ liệu chi tiết từng trận...");
  const { payload, failures } = await buildOddsPayload(upcoming);

  if (payload.length === 0) {
    await sendMessage(`⚠️ Tìm thấy ${upcoming.length} trận sắp đá nhưng không lấy được dữ liệu cho trận nào (có thể x-hd token đã hết hạn).`);
    console.log("→ Không lấy được dữ liệu cho trận nào. Đã gửi cảnh báo.");
    return;
  }

  if (failures.length > 0) {
    const failedList = failures
      .map((f) => `• ${f.match.home} vs ${f.match.away}: ${f.message}`)
      .join("\n");
    await sendMessage(
      `⚠️ Lấy dữ liệu thất bại cho ${failures.length} trận (đã bỏ qua, vẫn gửi ${payload.length} trận còn lại):\n${failedList}`,
    );
  }

  const formatKickoff = (unixSeconds: number) =>
    new Date(unixSeconds * 1000).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatMatchFilename = (home: string, away: string, kickoffUnix: number): string => {
    const date = new Date(kickoffUnix * 1000);
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const parts = formatter.formatToParts(date);
    const dateObj = {
      year: parts.find((p) => p.type === "year")?.value,
      month: parts.find((p) => p.type === "month")?.value,
      day: parts.find((p) => p.type === "day")?.value,
      hour: parts.find((p) => p.type === "hour")?.value,
      minute: parts.find((p) => p.type === "minute")?.value,
    };

    const sanitize = (name: string) =>
      name
        .trim()
        .toUpperCase()
        .replace(/[/\\:*?"<>|]/g, "_")
        .replace(/\s+/g, "_");

    return `${sanitize(home)}_vs_${sanitize(away)}_${dateObj.year}-${dateObj.month}-${dateObj.day}_${dateObj.hour}-${dateObj.minute}.json`;
  };

  const matchListText = payload
    .slice()
    .sort((a, b) => a.kickoffUnix - b.kickoffUnix)
    .map((m, i) => `${i + 1}. ⏰ *${formatKickoff(m.kickoffUnix)}*\n   🏟 ${m.home} vs ${m.away}`)
    .join("\n\n");

  await sendMessage(
    `🏆 *Dữ liệu ${payload.length} trận đấu sắp đá trong ${HOURS_WINDOW}h tới*\n\n${matchListText}`,
  );

  console.log("\n📤 Gửi từng file trận lên Telegram...");
  for (const match of payload) {
    const buffer = Buffer.from(JSON.stringify(match, null, 2));
    const filename = formatMatchFilename(match.home, match.away, match.kickoffUnix);
    const caption = `⚽ ${match.home} vs ${match.away}`;
    await sendDocument(buffer, filename, caption);
  }

  console.log(`\n✅ Đã gửi ${payload.length} file trận đấu lên Telegram.`);
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  await notifyError("Match Odds Scanner", error);
  process.exit(1);
});
