import type { ChartConfig } from "./types.js";

function chart(name: string, symbol: string): ChartConfig {
  return { name: `${name} H4`, symbol, interval: "240", description: `${name} — H4` };
}

export const CHARTS: ChartConfig[] = [
  // Commodities
  chart("XAU/USD", "OANDA:XAUUSD"),
  chart("XAG/USD", "OANDA:XAGUSD"),

  // Major pairs
  chart("EUR/USD", "OANDA:EURUSD"),
  chart("GBP/USD", "OANDA:GBPUSD"),
  chart("USD/JPY", "OANDA:USDJPY"),
  chart("AUD/USD", "OANDA:AUDUSD"),
  chart("USD/CHF", "OANDA:USDCHF"),
  chart("USD/CAD", "OANDA:USDCAD"),
  chart("NZD/USD", "OANDA:NZDUSD"),

  // Cross pairs
  chart("EUR/GBP", "OANDA:EURGBP"),
  chart("EUR/JPY", "OANDA:EURJPY"),
  chart("GBP/JPY", "OANDA:GBPJPY"),
  chart("AUD/JPY", "OANDA:AUDJPY"),
  chart("EUR/AUD", "OANDA:EURAUD"),
  chart("GBP/AUD", "OANDA:GBPAUD"),
  chart("EUR/CAD", "OANDA:EURCAD"),
];

export function buildChartHtml(c: ChartConfig): string {
  return `<!DOCTYPE html>
<html><head><style>body{margin:0;background:#131722;}#tv_chart{width:100%;height:100vh;}</style></head>
<body>
<div id="tv_chart"></div>
<script src="https://s3.tradingview.com/tv.js"></script>
<script>
new TradingView.widget({
  container_id: "tv_chart",
  autosize: true,
  symbol: "${c.symbol}",
  interval: "${c.interval}",
  timezone: "Etc/UTC",
  theme: "dark",
  style: "1",
  locale: "en",
  hide_top_toolbar: false,
  hide_side_toolbar: false,
  allow_symbol_change: false,
  save_image: false,
  withdateranges: true,
  studies: [
    { id: "MAExp@tv-basicstudies", inputs: { length: 20 } }
  ]
});
</script>
</body></html>`;
}
