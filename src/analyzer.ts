import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ScreenshotResult, AnalysisResult } from "./types.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const ANALYSIS_PROMPT = `Bạn là một chuyên gia phân tích kỹ thuật (Technical Analysis) giàu kinh nghiệm.

Hãy phân tích chart TradingView trong ảnh và đưa ra nhận định chi tiết bằng tiếng Việt.

## Yêu cầu phân tích:

1. **Xu hướng hiện tại**: Uptrend / Downtrend / Sideway — xác định dựa trên price action và MA
2. **Các mức hỗ trợ & kháng cự quan trọng**: Ghi rõ giá cụ thể
3. **Chỉ báo kỹ thuật**: Đọc RSI, MACD, MA và đưa nhận định
4. **Mô hình nến**: Nhận diện pattern nổi bật (nếu có)
5. **Kế hoạch giao dịch**:
   - Entry zone (vùng giá vào lệnh)
   - Stop Loss (cắt lỗ)
   - Take Profit 1, 2 (chốt lời)
   - Risk/Reward ratio
   - Hướng giao dịch: LONG / SHORT / CHỜ

## Format trả lời:
- Ngắn gọn, rõ ràng, đi thẳng vào vấn đề
- Ghi rõ mức giá cụ thể
- Cuối cùng đưa ra kết luận: nên hành động gì ngay bây giờ

⚠️ Lưu ý: Đây chỉ là phân tích tham khảo, không phải lời khuyên đầu tư.`;

export async function analyzeChart(
  screenshot: ScreenshotResult,
): Promise<AnalysisResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const imagePart = {
    inlineData: {
      mimeType: "image/png" as const,
      data: screenshot.buffer.toString("base64"),
    },
  };

  const prompt = `Chart: ${screenshot.chart.name} (${screenshot.chart.description})\n\n${ANALYSIS_PROMPT}`;

  const result = await model.generateContent([prompt, imagePart]);
  const response = result.response;
  const analysis = response.text();

  return {
    chart: screenshot.chart,
    analysis,
    screenshotPath: screenshot.filepath,
  };
}

export async function analyzeAllCharts(
  screenshots: ScreenshotResult[],
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (const screenshot of screenshots) {
    try {
      const result = await analyzeChart(screenshot);
      results.push(result);
      console.log(`✓ Analyzed: ${screenshot.chart.name}`);

      // Rate limit: wait between requests
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    } catch (error) {
      console.error(`✗ Failed to analyze ${screenshot.chart.name}:`, error);
    }
  }

  return results;
}
