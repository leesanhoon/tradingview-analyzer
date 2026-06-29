import { getConfiguredBookmaker } from "./betting-api.js";
import { buildOddsPayload, pickNearestUpcomingDateMatches } from "./betting.js";
import { sendMessage } from "../shared/telegram.js";
import { loadUpcomingMatches } from "./match-repository.js";
import { formatOddsText, formatMainOddsSummary } from "./odds-text-format.js";

function formatKickoff(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LABEL = "Match Odds";

/**
 * Lấy odds cho toàn bộ trận của ngày gần nhất sắp tới (ưu tiên hôm nay nếu còn trận
 * chưa đá; nếu hôm nay hết trận, tự chuyển sang ngày kế tiếp có lịch trong DB).
 * Chạy 1 lần/ngày (cron 12h trưa) hoặc chạy tay — luôn gửi lại toàn bộ, không dedup.
 */
export async function runOddsCheck(): Promise<void> {
  console.log(`🏆 ${LABEL} — Starting...\n`);

  const upcoming = await loadUpcomingMatches();
  const matches = pickNearestUpcomingDateMatches(upcoming);
  console.log(`✓ ${matches.length} trận chưa đá của ngày gần nhất (${matches[0]?.date ?? "—"})\n`);

  if (matches.length === 0) {
    await sendMessage(`⏸ [${LABEL}] Không có trận nào sắp tới trong DB — hãy chạy lại fetch-matches-list.`);
    console.log("✓ Không có trận nào sắp tới — bỏ qua, không gửi Telegram.\n");
    return;
  }

  const bookmakerKey = getConfiguredBookmaker();
  console.log(`📊 Dò + lấy TOÀN BỘ market từ bookmaker "${bookmakerKey}" cho từng trận...`);
  const { payload, failures } = await buildOddsPayload(matches);

  if (failures.length > 0) {
    const failedList = failures
      .map((f) => `• ${f.match.home} vs ${f.match.away}: ${f.message}`)
      .join("\n");
    await sendMessage(`⚠️ [${LABEL}] Lấy dữ liệu thất bại cho ${failures.length} trận (đã bỏ qua):\n${failedList}`);
  }

  const statusText =
    payload.length > 0
      ? `🏆 *[${LABEL}] ${payload.length} trận lấy được kèo* (ngày ${matches[0].date}):\n\n` +
        payload
          .slice()
          .sort((a, b) => a.kickoffUnix - b.kickoffUnix)
          .map((m, i) => {
            const mainOdds = formatMainOddsSummary(m);
            return (
              `${i + 1}. ⏰ *${formatKickoff(m.kickoffUnix)}*\n   🏟 ${m.home} vs ${m.away}` +
              (mainOdds ? `\n   💰 ${mainOdds}` : "")
            );
          })
          .join("\n\n")
      : `⏸ [${LABEL}] ${matches.length} trận ngày ${matches[0].date}, nhưng không lấy được kèo trận nào.`;

  await sendMessage(statusText);

  if (payload.length > 0) {
    console.log("\n📤 Gửi từng trận lên Telegram (dạng text)...");
    for (const match of payload) {
      await sendMessage(`\`\`\`\n${formatOddsText(match)}\n\`\`\``);
    }
    console.log(`\n✅ Đã gửi ${payload.length} trận đấu lên Telegram.`);
  } else {
    console.log("\n✓ Không có trận cần gửi.");
  }
}
