import "./env.js";
import { captureAllCharts } from "./screenshot.js";
import { analyzeAllCharts } from "./analyzer.js";
import { sendAllAnalyses } from "./telegram.js";

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("🚀 Bob Volman H4 Scanner — Starting...\n");

  console.log("📸 Capturing all forex charts (H4 + EMA 20)...");
  const screenshots = await captureAllCharts();

  if (screenshots.length === 0) {
    console.error("No charts captured. Exiting.");
    process.exit(1);
  }
  console.log(`✓ Captured ${screenshots.length} charts\n`);

  console.log("🤖 Analyzing charts...");
  const result = await analyzeAllCharts(screenshots);
  console.log("✓ Analysis complete\n");

  console.log("📨 Sending results to Telegram...");
  await sendAllAnalyses(result);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! Scanned ${screenshots.length} pairs in ${elapsed}s`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
