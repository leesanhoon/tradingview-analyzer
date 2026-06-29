import "../shared/env.js";
import { runLotteryVerify } from "./lottery-verify-runner.js";
import { notifyError } from "../shared/telegram.js";
import type { LotteryRegion } from "./lottery-types.js";

const region = process.argv[2] as LotteryRegion | undefined;
const VALID_REGIONS: LotteryRegion[] = ["mien-bac", "mien-trung", "mien-nam"];

if (!region || !VALID_REGIONS.includes(region)) {
  console.error(`Usage: lottery-verify <${VALID_REGIONS.join("|")}>`);
  process.exit(1);
}

runLotteryVerify(region).catch(async (error) => {
  console.error("Fatal error:", error);
  await notifyError(`Lottery Verify ${region}`, error);
  process.exit(1);
});
