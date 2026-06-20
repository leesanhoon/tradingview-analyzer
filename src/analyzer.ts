import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type { ScreenshotResult, AnalysisResult } from "./types.js";

const IsUseGemini = true;

const ANALYSIS_PROMPT = `Bạn là một trader chuyên nghiệp sử dụng phương pháp Price Action Scalping của Bob Volman, tập trung vào EMA 20 trên khung M5.

Tôi gửi bạn tất cả chart M5 của các cặp forex chính. Hãy phân tích TỪNG cặp và cuối cùng đưa ra KHUYẾN NGHỊ tổng hợp.

## Phân tích TỪNG cặp tiền — theo phương pháp Bob Volman:

### 1. Bối cảnh thị trường (Market Context)
- **Vị trí giá vs EMA 20**: Trên / Dưới / Đang cắt → xác định bias
- **Độ dốc EMA 20**: Dốc lên / Dốc xuống / Phẳng → momentum
- **Khoảng cách giá vs EMA 20**: Xa (có thể pullback) / Gần (có thể breakout)

### 2. Nhận diện setup Bob Volman
- **DD (Double Doji Break)**: Hai nến doji liên tiếp tại vùng hỗ trợ/kháng cự → breakout
- **FB (First Break)**: Phá vỡ đầu tiên sau buildup sát EMA 20
- **SB (Second Break)**: Phá vỡ thứ hai sau false break nhỏ từ FB
- **BB (Block Break)**: Phá vỡ khỏi block (vùng giá đi ngang dày đặc)
- **RB (Range Break)**: Phá vỡ range rõ ràng với buildup tốt
- **IRB (Inside Range Break)**: Breakout từ range nhỏ trong range lớn
- **ARB (Advanced Range Break)**: Breakout phức tạp với nhiều lần test biên

### 3. Chất lượng Price Action
- **Buildup**: Nến nhỏ, biên độ hẹp trước breakout? Buildup tốt = tín hiệu mạnh
- **Squeeze**: Giá bị ép sát EMA 20? Squeeze chặt = áp lực lớn
- **Tease**: Cú test nhẹ vào vùng breakout trước khi phá thật?
- **False break**: Cú phá giả vừa xảy ra? → thường dẫn đến move ngược mạnh
- **Round number**: Gần số tròn quan trọng?

### 4. Kế hoạch giao dịch (nếu có setup)
- **Setup**: Tên setup Bob Volman
- **Hướng**: LONG / SHORT / CHỜ
- **Entry**: Mức giá cụ thể
- **Stop Loss**: Sau swing high/low gần nhất (thường 8-15 pips)
- **Take Profit**: Mức hỗ trợ/kháng cự tiếp theo hoặc round number
- **Risk/Reward**: Tối thiểu 1:1.5

## KHUYẾN NGHỊ TỔNG HỢP (cuối cùng):
- Xếp hạng các cặp tiền theo chất lượng setup: ⭐⭐⭐ (tốt nhất) → ⭐ (yếu nhất)
- Chọn tối đa 1-2 cặp có setup tốt nhất để trade
- Nếu KHÔNG cặp nào có setup rõ ràng → nói thẳng "Không có setup, chờ đợi"
- Thị trường choppy → cảnh báo "Không nên giao dịch lúc này"
- Bob Volman: "Không trade cũng là một quyết định đúng"

## Format:
- Ngắn gọn, thực chiến
- Ghi rõ mức giá cụ thể
- Dùng ngôn ngữ Bob Volman: buildup, squeeze, tease, false break, round number
- Trả lời bằng tiếng Việt

⚠️ Lưu ý: Đây chỉ là phân tích tham khảo, không phải lời khuyên đầu tư.`;

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
): Promise<AnalysisResult[]> {
  let analysis: string;
  let provider: string;

  try {
    console.log("  → Trying Gemini 2.5 Flash (free)...");
    analysis = IsUseGemini ? await analyzeWithGemini(screenshots) : await analyzeWithClaude(screenshots);
    provider = "Gemini 2.5 Flash";
  } catch (geminiError) {
    console.warn(`  ⚠ Gemini failed: ${geminiError instanceof Error ? geminiError.message : geminiError}`);
    console.log("  → Falling back to Claude Sonnet 4.6...");
    analysis = await analyzeWithClaude(screenshots);
    provider = "Claude Sonnet 4.6";
  }

  console.log(`  ✓ Analyzed by ${provider}`);

  return [
    {
      chart: { name: "Tổng hợp Forex M5", symbol: "ALL", interval: "5", description: `Bob Volman Scalping — ${provider}` },
      analysis,
      screenshots,
    },
  ];
}
