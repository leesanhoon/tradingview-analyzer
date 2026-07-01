import { getDb } from "../shared/db.js";
import { createLogger } from "../shared/logger.js";
import type { TradeSetup } from "../shared/types.js";
import {
  buildOpenPositionInsertRow,
  deriveManagementPatch,
  getConfiguredMinRiskRewardRatio,
  type OpenPositionManagementPatch,
  type PositionDecisionOutcome,
} from "./position-engine.js";

const logger = createLogger("charts:positions-repository");

export type OpenPosition = {
  id: number;
  pair: string;
  direction: "LONG" | "SHORT";
  setup: string | null;
  entry: string;
  stopLoss: string;
  takeProfit1: string;
  takeProfit2: string | null;
  reasons: string[] | null;
  openedAt: string;
  status: "open" | "closed";
  lastDecision: "HOLD" | "CLOSE" | "STOP" | null;
  lastDecisionConfidence: number | null;
  lastDecisionComment: string | null;
  lastCheckedAt: string | null;
  closedAt: string | null;
  tradeStage: "open" | "tp1_partial" | "trailing" | "closed" | null;
  tp1ClosePercent: number | null;
  tp1ClosedPercent: number | null;
  tp1ClosedAt: string | null;
  trailingStopLoss: string | null;
  trailingStartedAt: string | null;
  riskRewardRatio: number | null;
  tp1RiskRewardRatio: number | null;
  tp2RiskRewardRatio: number | null;
  minRiskRewardRatio: number | null;
  lastManagementAction: string | null;
  lastManagementComment: string | null;
  lastManagementAt: string | null;
};

export async function saveOpenPosition(setup: TradeSetup): Promise<boolean> {
  const row = buildOpenPositionInsertRow(setup, {
    minRiskReward: getConfiguredMinRiskRewardRatio(),
  });
  if (!row) {
    logger.warn("Rejected open position due to invalid risk/reward", { pair: setup.pair });
    return false;
  }

  const { data: existing, error: existingError } = await (getDb().from("open_positions") as any)
    .select("id")
    .eq("status", "open")
    .eq("pair", setup.pair)
    .limit(1);

  if (existingError) throw new Error(`saveOpenPosition lookup failed: ${existingError.message}`);
  if ((existing ?? []).length > 0) return false;

  const { error } = await (getDb().from("open_positions") as any).insert(row);
  if (error) throw new Error(`saveOpenPosition insert failed: ${error.message}`);
  return true;
}

export async function loadOpenPositions(): Promise<OpenPosition[]> {
  const { data, error } = await (getDb().from("open_positions") as any)
    .select(
      "id, pair, direction, setup, entry, stop_loss, take_profit_1, take_profit_2, reasons, opened_at, status, last_decision, last_decision_confidence, last_decision_comment, last_checked_at, closed_at, trade_stage, tp1_close_percent, tp1_closed_percent, tp1_closed_at, trailing_stop_loss, trailing_started_at, risk_reward_ratio, tp1_risk_reward_ratio, tp2_risk_reward_ratio, min_risk_reward_ratio, last_management_action, last_management_comment, last_management_at",
    )
    .eq("status", "open")
    .order("opened_at", { ascending: true });

  if (error) throw new Error(`loadOpenPositions failed: ${error.message}`);
  return (
    (data ?? []) as Array<{
      id: number;
      pair: string;
      direction: "LONG" | "SHORT";
      setup: string | null;
      entry: string;
      stop_loss: string;
      take_profit_1: string;
      take_profit_2: string | null;
      reasons: string[] | null;
      opened_at: string;
      status: "open" | "closed";
      last_decision: "HOLD" | "CLOSE" | "STOP" | null;
      last_decision_confidence: number | null;
      last_decision_comment: string | null;
      last_checked_at: string | null;
      closed_at: string | null;
      trade_stage: "open" | "tp1_partial" | "trailing" | "closed" | null;
      tp1_close_percent: number | null;
      tp1_closed_percent: number | null;
      tp1_closed_at: string | null;
      trailing_stop_loss: string | null;
      trailing_started_at: string | null;
      risk_reward_ratio: number | null;
      tp1_risk_reward_ratio: number | null;
      tp2_risk_reward_ratio: number | null;
      min_risk_reward_ratio: number | null;
      last_management_action: string | null;
      last_management_comment: string | null;
      last_management_at: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    pair: row.pair,
    direction: row.direction,
    setup: row.setup,
    entry: row.entry,
    stopLoss: row.stop_loss,
    takeProfit1: row.take_profit_1,
    takeProfit2: row.take_profit_2,
    reasons: row.reasons,
    openedAt: row.opened_at,
    status: row.status,
    lastDecision: row.last_decision,
    lastDecisionConfidence: row.last_decision_confidence,
    lastDecisionComment: row.last_decision_comment,
    lastCheckedAt: row.last_checked_at,
    closedAt: row.closed_at,
    tradeStage: row.trade_stage,
    tp1ClosePercent: row.tp1_close_percent,
    tp1ClosedPercent: row.tp1_closed_percent,
    tp1ClosedAt: row.tp1_closed_at,
    trailingStopLoss: row.trailing_stop_loss,
    trailingStartedAt: row.trailing_started_at,
    riskRewardRatio: row.risk_reward_ratio,
    tp1RiskRewardRatio: row.tp1_risk_reward_ratio,
    tp2RiskRewardRatio: row.tp2_risk_reward_ratio,
    minRiskRewardRatio: row.min_risk_reward_ratio,
    lastManagementAction: row.last_management_action,
    lastManagementComment: row.last_management_comment,
    lastManagementAt: row.last_management_at,
  }));
}

export async function updatePositionDecision(
  id: number,
  decision: PositionDecisionOutcome,
  patch: OpenPositionManagementPatch | null = null,
): Promise<void> {
  const { error } = await (getDb().from("open_positions") as any)
    .update({
      last_decision: decision.decision,
      last_decision_confidence: decision.confidence,
      last_decision_comment: decision.comment,
      last_checked_at: new Date().toISOString(),
      ...(patch?.tradeStage !== undefined ? { trade_stage: patch.tradeStage } : {}),
      ...(patch?.tp1ClosedPercent !== undefined ? { tp1_closed_percent: patch.tp1ClosedPercent } : {}),
      ...(patch?.tp1ClosedAt !== undefined ? { tp1_closed_at: patch.tp1ClosedAt } : {}),
      ...(patch?.trailingStopLoss !== undefined ? { trailing_stop_loss: patch.trailingStopLoss } : {}),
      ...(patch?.trailingStartedAt !== undefined ? { trailing_started_at: patch.trailingStartedAt } : {}),
      ...(patch?.lastManagementAction !== undefined ? { last_management_action: patch.lastManagementAction } : {}),
      ...(patch?.lastManagementComment !== undefined ? { last_management_comment: patch.lastManagementComment } : {}),
      ...(patch?.lastManagementAt !== undefined ? { last_management_at: patch.lastManagementAt } : {}),
      ...(patch?.stopLoss !== undefined ? { stop_loss: patch.stopLoss } : {}),
    })
    .eq("id", id);

  if (error) throw new Error(`updatePositionDecision failed: ${error.message}`);
}

export function buildPositionManagementPatch(
  position: OpenPosition,
  decision: PositionDecisionOutcome,
): { patch: OpenPositionManagementPatch | null; closePosition: boolean } {
  return deriveManagementPatch(position.stopLoss, position.entry, decision, {
    partialClosePercent: position.tp1ClosePercent ?? undefined,
  });
}

export async function closePosition(id: number): Promise<void> {
  const { error } = await (getDb().from("open_positions") as any)
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      trade_stage: "closed",
    })
    .eq("id", id);

  if (error) throw new Error(`closePosition failed: ${error.message}`);
}
