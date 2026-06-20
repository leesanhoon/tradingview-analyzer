# TradingView Auto Analyzer

Tự động chụp chart TradingView → phân tích bằng Gemini AI → gửi kết quả qua Telegram.

Chạy miễn phí trên GitHub Actions mỗi 4 giờ.

## Stack

- **Node.js + TypeScript** — runtime & language
- **Playwright** — headless browser chụp chart
- **Google Gemini 2.0 Flash** — AI phân tích chart (free tier)
- **Telegram Bot** — nhận kết quả
- **GitHub Actions** — scheduler miễn phí

## Setup

### 1. Tạo Gemini API Key (miễn phí)

1. Truy cập [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **Create API Key**
3. Copy API key

### 2. Tạo Telegram Bot

1. Mở Telegram, tìm [@BotFather](https://t.me/BotFather)
2. Gửi `/newbot` → đặt tên → nhận **Bot Token**
3. Mở bot vừa tạo, gửi tin nhắn bất kỳ (ví dụ: `/start`)
4. Lấy Chat ID:
   ```
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   Chat ID nằm trong `result[0].message.chat.id`

### 3. Deploy lên GitHub

1. Fork hoặc push repo này lên GitHub
2. Vào **Settings → Secrets and variables → Actions**
3. Thêm 3 secrets:
   - `GEMINI_API_KEY` — API key từ bước 1
   - `TELEGRAM_BOT_TOKEN` — Bot token từ bước 2
   - `TELEGRAM_CHAT_ID` — Chat ID từ bước 2

### 4. Chạy thử

- Vào tab **Actions** → chọn workflow → **Run workflow**
- Hoặc đợi đến giờ chạy tự động (mỗi 4h)

## Tùy chỉnh chart

Sửa file `src/charts.config.ts` để thêm/bớt chart:

```typescript
export const CHARTS: ChartConfig[] = [
  {
    name: "BTC/USDT 4H",
    symbol: "BINANCE:BTCUSDT",     // TradingView symbol
    interval: "240",                // 1, 5, 15, 60, 240, D, W
    description: "Bitcoin 4-hour",
  },
  // Thêm chart khác tại đây...
];
```

### Interval phổ biến

| Giá trị | Timeframe |
|---------|-----------|
| `1`     | 1 phút    |
| `5`     | 5 phút    |
| `15`    | 15 phút   |
| `60`    | 1 giờ     |
| `240`   | 4 giờ     |
| `D`     | 1 ngày    |
| `W`     | 1 tuần    |

## Chạy local

```bash
# Install dependencies
npm install
npx playwright install chromium

# Set environment variables
cp .env.example .env
# Sửa .env với API keys thật

# Chạy
npm run analyze
```

## Chi phí

| Service         | Free Tier                        |
|-----------------|----------------------------------|
| GitHub Actions  | 2000 mins/tháng (private repo)   |
| Gemini API      | 15 RPM, 1M tokens/ngày           |
| Telegram Bot    | Không giới hạn                   |
| **Tổng**        | **$0/tháng**                     |

Mỗi lần chạy ~2-3 phút → 6 lần/ngày × 3 phút = ~18 phút/ngày → ~540 phút/tháng ✓

## Lưu ý

- Chart sử dụng TradingView widget URL (public) — không cần tài khoản TradingView
- Indicators mặc định: MA, RSI, MACD — có thể tùy chỉnh trong `charts.config.ts`
- Gemini free tier có rate limit — nếu nhiều chart, tăng delay giữa các request
- **Phân tích chỉ mang tính tham khảo, không phải lời khuyên đầu tư**
