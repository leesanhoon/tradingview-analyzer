import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type { ScreenshotResult, AnalysisResult, TradeSetup } from "./types.js";

const ANALYSIS_PROMPT = `Bạn là một trader chuyên nghiệp áp dụng các nguyên lý Price Action của Bob Volman (buildup, squeeze, false break, tease, round number) trên khung H4 với EMA 20.

Tôi gửi bạn tất cả chart H4 của các cặp forex chính + XAU/USD.

## Nhiệm vụ:
Phân tích từng cặp và CHỈ chọn ra những cặp có setup đạt ĐỘ TIN CẬY CAO.

## Tiêu chí độ tin cậy cao — cần ít nhất 3/5:
1. Buildup rõ ràng (nến nhỏ tích lũy trước breakout)
2. Đúng hướng EMA 20 (trade theo hướng dốc của EMA)
3. False break hoặc tease xác nhận
4. Gần round number hoặc support/resistance quan trọng
5. Nến xác nhận mạnh (thân dài, bấc ngắn)

## Nguyên lý Bob Volman áp dụng cho H4:
- Buildup + Break: tích lũy sát EMA 20 hoặc S/R → phá vỡ
- False Break → Reversal: phá giả → đảo chiều mạnh
- Squeeze vào EMA 20: giá bị ép sát EMA → breakout
- Block Break: vùng đi ngang dày đặc → phá vỡ
- R:R tối thiểu 1:2

## YÊU CẦU OUTPUT:
Trả lời ĐÚNG format JSON sau, KHÔNG có text nào khác ngoài JSON:

{
  "setups": [
    {
      "pair": "EUR/USD",
      "direction": "LONG",
      "setup": "Buildup + Break tại EMA 20",
      "reasons": ["Buildup 5 nến sát EMA 20", "EMA 20 dốc lên", "False break xuống trước đó"],
      "entry": "1.0850",
      "stopLoss": "1.0810",
      "takeProfit1": "1.0910",
      "takeProfit2": "1.0950",
      "riskReward": "1:2.5",
      "summary": "Buildup chặt sát EMA 20 dốc lên, false break xác nhận. Entry khi phá high buildup."
    }
  ],
  "noSetupReason": ""
}

Nếu KHÔNG có cặp nào đạt tiêu chuẩn:
{
  "setups": [],
  "noSetupReason": "Thị trường choppy, không có buildup rõ ràng trên tất cả các cặp. Chờ đợi."
}

QUAN TRỌNG:
- Chỉ liệt kê setup có độ tin cậy CAO
- Entry, SL, TP phải là mức giá CỤ THỂ
- Không trade cũng là một quyết định đúng
- CHỈ trả về JSON, không có markdown hay text khác`;

function parseAnalysisResponse(text: string): { setups: TradeSetup[]; noSetupReason: string } {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      setups: parsed.setups || [],
      noSetupReason: parsed.noSetupReason || "",
    };
  } catch {
    return { setups: [], noSetupReason: "Lỗi parse response từ AI. Raw: " + text.slice(0, 200) };
  }
}

async function analyzeWithGemini(screenshots: ScreenshotResult[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const parts: Array<{ inlineData: { mimeType: "image/png"; data: string } } | { text: string }> = [];
  for (const screenshot of screenshots) {
    parts.push({
      inlineData: { mimeType: "image/png", data: screenshot.buffer.toString("base64") },
    });
    parts.push({
      text: `[Chart: ${screenshot.chart.name} — ${screenshot.chart.description}]`,
    });
  }
  parts.push({ text: ANALYSIS_PROMPT });

  const result = await model.generateContent(parts);
  return result.response.text();
}

async function analyzeWithClaude(screenshots: ScreenshotResult[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  for (const screenshot of screenshots) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: screenshot.buffer.toString("base64") },
    });
    content.push({
      type: "text",
      text: `[Chart: ${screenshot.chart.name} — ${screenshot.chart.description}]`,
    });
  }
  content.push({ type: "text", text: ANALYSIS_PROMPT });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content }],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function analyzeAllCharts(
  screenshots: ScreenshotResult[],
): Promise<AnalysisResult> {
  let rawResponse: string;
  let provider: string;

  try {
    console.log("  → Using Claude Sonnet 4.6...");
    rawResponse = await analyzeWithClaude(screenshots);
    provider = "Claude Sonnet 4.6";
  } catch (claudeError) {
    console.warn(`  ⚠ Claude failed: ${claudeError instanceof Error ? claudeError.message : claudeError}`);
    console.log("  → Falling back to Gemini 2.5 Flash...");
    rawResponse = await analyzeWithGemini(screenshots);
    provider = "Gemini 2.5 Flash";
  }

  console.log(`  ✓ Analyzed by ${provider}`);

  const { setups, noSetupReason } = parseAnalysisResponse(rawResponse);
  console.log(`  ✓ Found ${setups.length} high-confidence setup(s)`);

  return { setups, noSetupReason, screenshots };
}
