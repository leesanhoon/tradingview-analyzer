# Review findings — Phase 03: Webhook idempotency

Review của các thay đổi liên quan tới [docs/tasks/03-webhook-idempotency.md](03-webhook-idempotency.md). **Phase này coi như hoàn tất.**

## Đã hoàn thành (verify OK)
- Migration [supabase/migrations/20260701030000_create_telegram_webhook_idempotency.sql](../../supabase/migrations/20260701030000_create_telegram_webhook_idempotency.sql): bảng + function `claim_telegram_webhook_idempotency` atomic (INSERT...ON CONFLICT), TTL 24h.
- Logic idempotency được tách vào module dùng chung [src/shared/telegram-webhook-idempotency.ts](../../src/shared/telegram-webhook-idempotency.ts) (`buildTelegramWebhookIdempotencyDescriptor`, `shouldProcessTelegramWebhookUpdate`), có test riêng ở [tests/shared/telegram-webhook-idempotency.test.ts](../../tests/shared/telegram-webhook-idempotency.test.ts).
- **Webhook thật (`supabase/functions/telegram-webhook/index.ts`) đã được refactor để import và dùng đúng module dùng chung này** (dòng 3-9, 425-428, 452-455) — không còn 2 bản logic song song như review trước. Test hiện tại giờ cover đúng code path mà Telegram thực sự gọi tới.
- Không còn khai báo type trùng lặp (`TelegramMessage`/`TelegramCallbackQuery`/`TelegramUpdate` chỉ định nghĩa 1 chỗ, import từ module chung).
- `console.error` → `logger.error`, file rác `_write_test2.tmp` đã xóa từ review trước.
- `npm test` (4 files, 12 tests pass) và `npx tsc --noEmit` sạch.

## Việc còn lại (rất nhỏ, không bắt buộc)
- `buildTelegramWebhookIdempotencyDescriptor(update)` bị gọi 2 lần cho cùng 1 request (1 lần ngầm bên trong `shouldProcessTelegramWebhookUpdate`, 1 lần tường minh ở `index.ts` chỉ để lấy `eventType`/`idempotencyKey` phục vụ log). Hàm này thuần và rẻ (object literal build), không ảnh hưởng hiệu năng — chỉ là tiểu tiết code style, có thể bỏ qua.

## Kết luận
Toàn bộ acceptance criteria của Phase 03 đã đạt:
- [x] Gửi lại cùng update không dispatch trùng — logic + test xác nhận.
- [x] Bấm callback 2 lần chỉ trigger 1 workflow — logic + test xác nhận.
- [x] Webhook vẫn phản hồi nhanh — chỉ thêm 1 RPC call.

Không còn việc gì bắt buộc phải giao cho codex ở Phase 03. Có thể cập nhật [docs/tasks/00-overview.md](00-overview.md) và [docs/tasks/03-webhook-idempotency.md](03-webhook-idempotency.md) sang trạng thái `done`.
