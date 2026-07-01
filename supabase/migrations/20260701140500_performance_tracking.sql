alter table public.open_positions
  add column if not exists close_reason text,
  add column if not exists realized_risk_reward_ratio numeric(10,2),
  add column if not exists realized_exit_price text;

alter table public.open_positions
  drop constraint if exists open_positions_close_reason_check;

alter table public.open_positions
  add constraint open_positions_close_reason_check
  check (close_reason in ('stop_loss', 'take_profit_2', 'manual_close') or close_reason is null);
