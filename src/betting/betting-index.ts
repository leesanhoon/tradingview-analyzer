import "../shared/env.js";
import { runOddsCheck } from "./odds-runner.js";
import { notifyError } from "../shared/telegram.js";

runOddsCheck().catch(async (error) => {
  console.error("Fatal error:", error);
  await notifyError("Match Odds Scanner", error);
  process.exit(1);
});
