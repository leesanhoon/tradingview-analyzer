alter table public.open_positions
  add column if not exists trade_stage text not null default 'open',
  add column if not exists tp1_close_percent integer not null default 50,
  add column if not exists tp1_closed_percent integer not null default 0,
  add column if not exists tp1_closed_at timestamptz,
  add column if not exists trailing_stop_loss text,
  add column if not exists trailing_started_at timestamptz,
  add column if not exists risk_reward_ratio numeric(10,2),
  add column if not exists tp1_risk_reward_ratio numeric(10,2),
  add column if not exists tp2_risk_reward_ratio numeric(10,2),
  add column if not exists min_risk_reward_ratio numeric(10,2) not null default 1.5,
  add column if not exists last_management_action text not null default 'NONE',
  add column if not exists last_management_comment text,
  add column if not exists last_management_at timestamptz;
