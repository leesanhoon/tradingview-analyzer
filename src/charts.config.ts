import type { ChartConfig } from "./types.js";

const interval = "240"; // 240 minutes = 4 hours

export const CHARTS: ChartConfig[] = [
    {
    name: `XAU/USD ${interval}`,
    symbol: "OANDA:XAUUSD",
    interval,
    description: `Gold / US Dollar — ${interval} min`,
  },
  {
    name: `EUR/USD ${interval}`,
    symbol: "OANDA:EURUSD",
    interval,
    description: `Euro / US Dollar — ${interval} min`,
  },
  {
    name: `GBP/USD ${interval}`,
    symbol: "OANDA:GBPUSD",
    interval,
    description: `British Pound / US Dollar — ${interval} min`,
  },
  {
    name: `USD/JPY ${interval}`,
    symbol: "OANDA:USDJPY",
    interval,
    description: `US Dollar / Japanese Yen — ${interval} min`,
  },
  {
    name: `AUD/USD ${interval}`,
    symbol: "OANDA:AUDUSD",
    interval,
    description: `Australian Dollar / US Dollar — ${interval} min`,
  },
  {
    name: `USD/CHF ${interval}`,
    symbol: "OANDA:USDCHF",
    interval,
    description: `US Dollar / Swiss Franc — ${interval} min`,
  },
  {
    name: `USD/CAD ${interval}`,
    symbol: "OANDA:USDCAD",
    interval,
    description: `US Dollar / Canadian Dollar — ${interval} min`,
  },
  {
    name: `NZD/USD ${interval}`,
    symbol: "OANDA:NZDUSD",
    interval,
    description: `New Zealand Dollar / US Dollar — ${interval} min`,
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
