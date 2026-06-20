export type ChartConfig = {
  name: string;
  symbol: string;
  interval: string;
  description: string;
};

export type ScreenshotResult = {
  chart: ChartConfig;
  buffer: Buffer;
  filepath: string;
};

export type AnalysisResult = {
  chart: ChartConfig;
  analysis: string;
  screenshots: ScreenshotResult[];
};
