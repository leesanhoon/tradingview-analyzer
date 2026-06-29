import "../shared/env.js";
import { runLotteryPredict } from "./lottery-predict-runner.js";
import { notifyError } from "../shared/telegram.js";

runLotteryPredict().catch(async (error) => {
  console.error("Fatal error:", error);
  await notifyError("Lottery Predictor", error);
  process.exit(1);
});
