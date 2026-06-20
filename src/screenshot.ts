import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { join } from "path";
import { CHARTS, buildWidgetUrl } from "./charts.config.js";
import type { ScreenshotResult } from "./types.js";

const SCREENSHOT_DIR = join(process.cwd(), "screenshots");
const VIEWPORT = { width: 1400, height: 900 };
const CHART_LOAD_TIMEOUT = 15_000;
const CHART_RENDER_DELAY = 5_000;

export async function captureAllCharts(): Promise<ScreenshotResult[]> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results: ScreenshotResult[] = [];

  try {
    const context = await browser.newContext({ viewport: VIEWPORT });

    for (const chart of CHARTS) {
      try {
        const result = await captureChart(context, chart);
        results.push(result);
        console.log(`✓ Captured: ${chart.name}`);
      } catch (error) {
        console.error(`✗ Failed to capture ${chart.name}:`, error);
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function captureChart(
  context: Awaited<ReturnType<typeof chromium.launch>>["contexts"] extends Array<infer T> ? T : never,
  chart: (typeof CHARTS)[number],
): Promise<ScreenshotResult> {
  const page = await context.newPage();
  const url = buildWidgetUrl(chart);

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: CHART_LOAD_TIMEOUT,
    });

    // Wait for chart canvas to render
    await page.waitForSelector("canvas", { timeout: CHART_LOAD_TIMEOUT });
    await page.waitForTimeout(CHART_RENDER_DELAY);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${chart.symbol.replace(/[:/]/g, "_")}_${timestamp}.png`;
    const filepath = join(SCREENSHOT_DIR, filename);

    const buffer = await page.screenshot({
      path: filepath,
      fullPage: false,
      type: "png",
    });

    return { chart, buffer: Buffer.from(buffer), filepath };
  } finally {
    await page.close();
  }
}
