import "../shared/env.js";
import { runLotteryPredict } from "./lottery-predict-runner.js";
import { notifyError } from "../shared/telegram.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("lottery:lottery-predict-index");
runLotteryPredict().catch(async (error) => {
  logger.error("Fatal error:", error);
  await notifyError("Lottery Predictor", error);
  process.exit(1);
});

