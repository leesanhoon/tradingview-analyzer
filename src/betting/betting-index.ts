import "../shared/env.js";
import { runOddsCheck } from "./odds-runner.js";
import { notifyError } from "../shared/telegram.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("betting:betting-index");
runOddsCheck().catch(async (error) => {
  logger.error("Fatal error:", error);
  await notifyError("Match Odds Scanner", error);
  process.exit(1);
});

