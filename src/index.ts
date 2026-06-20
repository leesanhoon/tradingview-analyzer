import { captureAllCharts } from "./screenshot.js";
import { analyzeAllCharts } from "./analyzer.js";
import { sendAllAnalyses } from "./telegram.js";

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("🚀 Bob Volman Scalping Scanner — Starting...\n");

  console.log("📸 Capturing all forex charts (M5 + EMA 20)...");
  const screenshots = await captureAllCharts();

  if (screenshots.length === 0) {
    console.error("No charts captured. Exiting.");
    process.exit(1);
  }
  console.log(`✓ Captured ${screenshots.length} charts\n`);

  console.log("🤖 Sending all charts to Claude for analysis...");
  const analyses = await analyzeAllCharts(screenshots);

  if (analyses.length === 0) {
    console.error("No analyses generated. Exiting.");
    process.exit(1);
  }
  console.log("✓ Analysis complete\n");

  console.log("📨 Sending results to Telegram...");
  await sendAllAnalyses(analyses);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! Scanned ${screenshots.length} pairs in ${elapsed}s`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
