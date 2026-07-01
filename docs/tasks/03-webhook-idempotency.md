# Phase 03: Idempotency cho Telegram webhook → GitHub Actions

## Mục tiêu
Tránh trigger trùng workflow khi Telegram gửi lại update (network retry) hoặc người dùng bấm nút 2 lần.

## Bối cảnh / file liên quan
- [supabase/functions/telegram-webhook/index.ts](../../supabase/functions/telegram-webhook/index.ts): Supabase Edge Function, router trung tâm — parse update/callback query Telegram thành action qua `COMMANDS` map, rồi POST tới `https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow.file}/dispatches` để trigger GitHub Actions. Đây là nơi cần thêm idempotency check.
- Callback query handling nằm khoảng cuối file (~dòng 367+).

## Việc cần làm
- [x] Xác định khóa idempotency: dùng `update_id` (Telegram) hoặc `callback_query.id` làm key duy nhất.
- [x] Thêm bảng/cơ chế lưu trữ các update_id/callback_query.id đã xử lý gần đây (Supabase table hoặc in-memory cache có TTL, tuỳ giới hạn Edge Function).
- [x] Trước khi dispatch workflow, kiểm tra key đã xử lý chưa — nếu có, bỏ qua và trả response 200 (Telegram chỉ cần ack, không cần dispatch lại).
- [x] Set TTL hợp lý cho bản ghi idempotency (vd 24h) để tránh phình bảng vô hạn.
- [x] Xử lý race condition: hai request gần như đồng thời cho cùng update_id (dùng unique constraint trên cột update_id thay vì chỉ check-then-insert).

## Acceptance criteria
- [x] Gửi lại cùng một Telegram update (giả lập network retry) không tạo workflow dispatch thứ 2.
- [x] Bấm nút callback 2 lần liên tiếp nhanh chỉ trigger 1 workflow.
- [x] Webhook vẫn trả response nhanh (không làm chậm đáng kể do thêm check).

## Ghi chú / rủi ro
- Cần migration mới cho bảng idempotency vì repo chưa có `supabase/migrations`.
- Cân nhắc dùng unique constraint ở DB để xử lý race condition thay vì chỉ logic ở application layer.
