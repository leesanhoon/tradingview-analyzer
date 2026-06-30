import { getDb } from "../shared/db.js";
import type { TradeSetup } from "../shared/types.js";

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
};

export async function saveOpenPosition(setup: TradeSetup): Promise<boolean> {
  const { data: existing, error: existingError } = await (getDb().from("open_positions") as any)
    .select("id")
    .eq("status", "open")
    .eq("pair", setup.pair)
    .limit(1);

  if (existingError) throw new Error(`saveOpenPosition lookup failed: ${existingError.message}`);
  if ((existing ?? []).length > 0) return false;

  const row = {
    pair: setup.pair,
    direction: setup.direction,
    setup: setup.setup,
    entry: setup.entry,
    stop_loss: setup.stopLoss,
    take_profit_1: setup.takeProfit1,
    take_profit_2: setup.takeProfit2,
    reasons: setup.reasons,
    status: "open",
  };

  const { error } = await (getDb().from("open_positions") as any).insert(row);
  if (error) throw new Error(`saveOpenPosition insert failed: ${error.message}`);
  return true;
}

export async function loadOpenPositions(): Promise<OpenPosition[]> {
  const { data, error } = await (getDb().from("open_positions") as any)
    .select(
      "id, pair, direction, setup, entry, stop_loss, take_profit_1, take_profit_2, reasons, opened_at, status, last_decision, last_decision_confidence, last_decision_comment, last_checked_at, closed_at",
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
  }));
}

export async function updatePositionDecision(
  id: number,
  decision: "HOLD" | "CLOSE" | "STOP",
  confidence: number,
  comment: string,
): Promise<void> {
  const { error } = await (getDb().from("open_positions") as any)
    .update({
      last_decision: decision,
      last_decision_confidence: confidence,
      last_decision_comment: comment,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`updatePositionDecision failed: ${error.message}`);
}

export async function closePosition(id: number): Promise<void> {
  const { error } = await (getDb().from("open_positions") as any)
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`closePosition failed: ${error.message}`);
}
