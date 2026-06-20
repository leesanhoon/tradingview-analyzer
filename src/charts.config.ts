import type { ChartConfig } from "./types.js";

export const CHARTS: ChartConfig[] = [
  {
    name: "XAU/USD H4",
    symbol: "OANDA:XAUUSD",
    interval: "240",
    description: "Gold / US Dollar — H4",
  },
  {
    name: "EUR/USD H4",
    symbol: "OANDA:EURUSD",
    interval: "240",
    description: "Euro / US Dollar — H4",
  },
  {
    name: "GBP/USD H4",
    symbol: "OANDA:GBPUSD",
    interval: "240",
    description: "British Pound / US Dollar — H4",
  },
  {
    name: "USD/JPY H4",
    symbol: "OANDA:USDJPY",
    interval: "240",
    description: "US Dollar / Japanese Yen — H4",
  },
  {
    name: "AUD/USD H4",
    symbol: "OANDA:AUDUSD",
    interval: "240",
    description: "Australian Dollar / US Dollar — H4",
  },
  {
    name: "USD/CHF H4",
    symbol: "OANDA:USDCHF",
    interval: "240",
    description: "US Dollar / Swiss Franc — H4",
  },
  {
    name: "USD/CAD H4",
    symbol: "OANDA:USDCAD",
    interval: "240",
    description: "US Dollar / Canadian Dollar — H4",
  },
  {
    name: "NZD/USD H4",
    symbol: "OANDA:NZDUSD",
    interval: "240",
    description: "New Zealand Dollar / US Dollar — H4",
  },
];

export function buildChartHtml(chart: ChartConfig): string {
  return `<!DOCTYPE html>
<html><head><style>body{margin:0;background:#131722;}#tv_chart{width:100%;height:100vh;}</style></head>
<body>
<div id="tv_chart"></div>
<script src="https://s3.tradingview.com/tv.js"></script>
<script>
new TradingView.widget({
  container_id: "tv_chart",
  autosize: true,
  symbol: "${chart.symbol}",
  interval: "${chart.interval}",
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
