import "../shared/env.js";
import { captureAllCharts } from "./screenshot.js";
import { analyzeAllCharts, confirmHighConfidenceSetups } from "./analyzer.js";
import { saveOpenPosition } from "./positions-repository.js";
import { runCheckOpenTrades } from "./check-open-trades-runner.js";
import { sendAllAnalyses, notifyError } from "../shared/telegram.js";
import { getVerifyProviderLabel } from "./verify-provider.js";

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("🚀 Bob Volman H4 Scanner — Starting...\n");

  console.log("📸 Capturing all forex charts (H4 + EMA 20)...");
  const screenshots = await captureAllCharts();

  if (screenshots.length === 0) {
    throw new Error("No charts captured.");
  }
  console.log(`✓ Captured ${screenshots.length} charts\n`);

  console.log("🤖 Analyzing charts...");
  const result = await analyzeAllCharts(screenshots);
  console.log("✓ Analysis complete\n");

  const highConfSetups = result.setups.filter((s) => (s.confidence ?? 0) > 80);
  if (highConfSetups.length > 0) {
    console.log(`🔍 Verifying ${highConfSetups.length} high-confidence setup(s) with ${getVerifyProviderLabel()}...`);
    const verified = await confirmHighConfidenceSetups(highConfSetups, screenshots);
    const verifiedByPair = new Map(verified.map((s) => [s.pair, s]));
    result.setups = result.setups.map((s) => verifiedByPair.get(s.pair) ?? s);
    console.log("✓ Verification complete\n");
  }

  for (const setup of result.setups) {
    if (setup.verifiedConfirmed === true) {
      try {
        const saved = await saveOpenPosition(setup);
        if (saved) {
          setup.autoTracked = true;
          console.log(`✓ Auto-saved open position for ${setup.pair}`);
        } else {
          console.log(`ℹ️ Skipped duplicate open position for ${setup.pair}`);
        }
      } catch (error) {
        console.error(`✗ Failed to auto-save open position for ${setup.pair}:`, error);
      }
    }
  }

  console.log("📨 Sending results to Telegram...");
  await sendAllAnalyses(result);

  console.log("🔎 Checking open positions...");
  await runCheckOpenTrades();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! Scanned ${screenshots.length} pairs in ${elapsed}s`);
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  await notifyError("Bob Volman H4 Scanner", error);
  process.exit(1);
});
