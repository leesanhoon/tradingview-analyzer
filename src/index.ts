import "./env.js";
import { captureAllCharts } from "./screenshot.js";
import { analyzeAllCharts, confirmHighConfidenceSetups } from "./analyzer.js";
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

  const highConfSetups = result.setups.filter((s) => (s.confidence ?? 0) > 80);
  if (highConfSetups.length > 0) {
    console.log(`🔍 Verifying ${highConfSetups.length} high-confidence setup(s) with Claude Sonnet 4.6...`);
    const verified = await confirmHighConfidenceSetups(highConfSetups, screenshots);
    const verifiedByPair = new Map(verified.map((s) => [s.pair, s]));
    result.setups = result.setups.map((s) => verifiedByPair.get(s.pair) ?? s);
    console.log("✓ Verification complete\n");
  }

  console.log("📨 Sending results to Telegram...");
  await sendAllAnalyses(result);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! Scanned ${screenshots.length} pairs in ${elapsed}s`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
