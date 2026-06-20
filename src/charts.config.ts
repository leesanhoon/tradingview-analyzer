import type { ChartConfig } from "./types.js";

/**
 * Cấu hình các chart TradingView cần theo dõi.
 *
 * Hỗ trợ 2 loại URL:
 * 1. Widget URL (khuyên dùng — không cần login):
 *    https://www.tradingview.com/widgetembed/?symbol=BINANCE:BTCUSDT&interval=240&theme=dark
 *
 * 2. Public chart URL (shared chart):
 *    https://www.tradingview.com/chart/XXXXXXXX/
 *
 * Lưu ý: Chart cá nhân (cần login) sẽ không chụp được trên GitHub Actions.
 * Dùng widget URL để đảm bảo hoạt động ổn định.
 */
export const CHARTS: ChartConfig[] = [
  {
    name: "XAU/USD 4H",
    symbol: "OANDA:XAUUSD",
    interval: "240",
    description: "Gold 4-hour chart",
  },
];

export function buildWidgetUrl(chart: ChartConfig): string {
  const params = new URLSearchParams({
    symbol: chart.symbol,
    interval: chart.interval,
    theme: "dark",
    style: "1",
    locale: "en",
    hide_top_toolbar: "0",
    hide_side_toolbar: "0",
    allow_symbol_change: "0",
    save_image: "0",
    withdateranges: "1",
    studies: '["MASimple@tv-basicstudies","RSI@tv-basicstudies","MACD@tv-basicstudies"]',
  });

  return `https://www.tradingview.com/widgetembed/?${params.toString()}`;
}
