import { readFile } from "fs/promises";
import type { AnalysisResult } from "./types.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables are required",
  );
}

async function sendPhoto(
  photoBuffer: Buffer,
  caption: string,
): Promise<void> {
  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID!);
  formData.append("photo", new Blob([photoBuffer], { type: "image/png" }), "chart.png");
  formData.append("caption", caption.slice(0, 1024));
  formData.append("parse_mode", "Markdown");

  const response = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram sendPhoto failed: ${error}`);
  }
}

async function sendMessage(text: string): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram sendMessage failed: ${error}`);
  }
}

function splitMessage(text: string, maxLength: number = 4096): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

export async function sendAnalysisToTelegram(
  result: AnalysisResult,
): Promise<void> {
  const photoBuffer = await readFile(result.screenshotPath);

  const photoCaption = `📊 *${result.chart.name}*\n⏰ ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`;
  await sendPhoto(photoBuffer, photoCaption);

  const analysisHeader = `📈 *Phân tích: ${result.chart.name}*\n${"─".repeat(30)}\n\n`;
  const fullMessage = analysisHeader + result.analysis;
  const chunks = splitMessage(fullMessage);

  for (const chunk of chunks) {
    await sendMessage(chunk);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function sendAllAnalyses(
  results: AnalysisResult[],
): Promise<void> {
  const timestamp = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  await sendMessage(`🚀 *TradingView Auto Analysis*\n📅 ${timestamp}\n📊 ${results.length} charts analyzed`);

  for (const result of results) {
    try {
      await sendAnalysisToTelegram(result);
      console.log(`✓ Sent to Telegram: ${result.chart.name}`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } catch (error) {
      console.error(`✗ Failed to send ${result.chart.name}:`, error);
    }
  }

  await sendMessage(`✅ *Hoàn tất phân tích ${results.length} charts*\n\n⚠️ _Đây chỉ là phân tích tham khảo, không phải lời khuyên đầu tư._`);
}
