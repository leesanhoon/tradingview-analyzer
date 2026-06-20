import { captureAllCharts } from "./screenshot.js";
import { analyzeAllCharts } from "./analyzer.js";
import { sendAllAnalyses } from "./telegram.js";

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("🚀 Starting TradingView chart analysis...\n");

  console.log("📸 Capturing charts...");
  const screenshots = await captureAllCharts();

  if (screenshots.length === 0) {
    console.error("No charts captured. Exiting.");
    process.exit(1);
  }

  console.log(`\n🤖 Analyzing ${screenshots.length} charts with Gemini...\n`);
  const analyses = await analyzeAllCharts(screenshots);

  if (analyses.length === 0) {
    console.error("No analyses generated. Exiting.");
    process.exit(1);
  }

  console.log(`\n📨 Sending results to Telegram...\n`);
  await sendAllAnalyses(analyses);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! Processed ${analyses.length} charts in ${elapsed}s`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
