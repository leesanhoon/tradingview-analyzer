# Review — Migrations đã chạy trên Supabase thật

Xác nhận qua Supabase MCP (project `auto_signal_bot`, id `irgworcpfyfuigyvylkj`) sau khi codex chạy migrate.

## Kết quả: đã áp dụng đúng, không phát hiện lỗi

- Cả 6 migration trong `supabase/migrations/` đã xuất hiện trong `list_migrations` của project, đúng thứ tự thời gian:
  - `create_logs_table` (Phase 02)
  - `create_telegram_webhook_idempotency` (Phase 03)
  - `position_decision_engine` (Phase 05)
  - `performance_tracking` (Phase 06)
  - `betting_analysis_snapshots` (Phase 07)
  - `ai_usage_observability` (Phase 08)
- Đối chiếu schema thực tế (`list_tables`) với từng file SQL — khớp 100%:
  - `logs`: đủ cột `timestamp/level/message/context/source`, check constraint đúng level enum.
  - `telegram_webhook_idempotency`: `idempotency_key` unique, `expires_at` đúng.
  - `open_positions`: đủ toàn bộ cột mới từ Phase 05/06 (`trade_stage`, `tp1_close_percent`, `trailing_stop_loss`, `risk_reward_ratio`, `close_reason` với check constraint gồm cả `manual_close` — đúng bản fix ở Phase 06).
  - `betting_analysis_snapshots`: `game_id` unique, đủ cột đúng migration.
  - `ai_usage`: đủ cột, check constraint `provider`/`source`/`input_tokens >= 0`/`output_tokens >= 0` đúng.
- Advisor security/performance: chỉ có cảnh báo mức **INFO** (`rls_enabled_no_policy` cho toàn bộ bảng, kể cả các bảng có từ trước như `matches`/`lottery_draws`; `unused_index` vì bảng mới chưa có dữ liệu/traffic) — đây là pattern nhất quán đã có sẵn trong toàn bộ project (RLS bật nhưng không có policy vì app chỉ kết nối bằng `service_role` key, vốn bypass RLS), không phải vấn đề mới phát sinh từ các migration lần này, không cần fix.

## Kết luận
Việc chạy migrate bằng codex đã thành công và chính xác cho cả 6 phase (02, 03, 05, 06, 07, 08). Không có sai lệch giữa file SQL trong repo và schema thực tế trên Supabase.
