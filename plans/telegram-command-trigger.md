# Điều khiển workflow qua lệnh Telegram (miễn phí)

## Context

Hiện tại bot Telegram trong repo này (`src/shared/telegram.ts`) chỉ là **một chiều** — gửi thông báo ra, không nhận lệnh vào. Các tác vụ (`analyze`, `match-odds`, `fetch-matches-list`, `lottery`, `lottery-predict`, `lottery-verify`, `lottery-backfill`) chỉ chạy theo `cron` hoặc phải vào tay GitHub Actions UI bấm "Run workflow" (`workflow_dispatch`). Người dùng muốn thay vào đó: nhắn lệnh qua Telegram (vd `/analyze`, `/lottery_predict`) để kích hoạt workflow tương ứng ngay lập tức, không tốn phí.

**Giải pháp:** dùng **Supabase Edge Function** (project đã có sẵn Supabase, free tier đủ dùng) làm webhook nhận tin nhắn Telegram, parse lệnh, rồi gọi GitHub REST API để trigger `workflow_dispatch` của workflow tương ứng. Toàn bộ chuỗi này miễn phí: Telegram webhook miễn phí, Supabase Edge Function free tier (500K invocations/tháng), GitHub Actions free tier (workflow_dispatch không tốn gì ngoài phút chạy Actions vốn đã dùng).

## Kiến trúc

```
User → Telegram message → Telegram webhook → Supabase Edge Function
                                                   ↓ (parse lệnh, whitelist chat_id)
                                                   ↓ POST GitHub API
                                          /repos/{owner}/{repo}/actions/workflows/{file}/dispatches
                                                   ↓
                                          GitHub Actions chạy workflow → gửi kết quả qua Telegram như cũ
```

## Trạng thái hiện tại

`supabase/functions/telegram-webhook/index.ts` đã được viết sẵn (từ một lần thực thi ngoài ý muốn trước đó) và đã được review khớp với plan này:
- Verify `chat_id` + header `X-Telegram-Bot-Api-Secret-Token` đúng như thiết kế.
- Map lệnh `/analyze`, `/match_odds`, `/fetch_matches`, `/lottery`, `/lottery_predict`, `/lottery_verify [region]`, `/lottery_backfill [days]`, `/help` → đúng tên workflow file và đúng tên input (`region`, `days`) khớp với `lottery-verify.yml` và `lottery-backfill.yml`.
- `.env.example` và `README.md` đã được cập nhật tương ứng.

Còn thiếu: deploy thật, set secrets trên Supabase, đăng ký webhook với Telegram, và sửa văn phong README (hiện có đoạn tiếng Việt không dấu, lệch với phần còn lại của file dùng tiếng Việt có dấu). Các phần còn thiếu này sẽ giao cho **Codex CLI** thực thi (xem bước 6).

## Các bước thực hiện

### 1. Tạo Supabase Edge Function mới: `supabase/functions/telegram-webhook/index.ts` (đã có sẵn, chỉ cần review/sửa nếu Codex phát hiện vấn đề)
- Nhận POST từ Telegram (Deno runtime, dùng `Deno.serve`)
- Xác thực: kiểm tra `message.chat.id` khớp với `TELEGRAM_CHAT_ID` (secret) — chặn lệnh từ người lạ
- Map lệnh → workflow file, ví dụ:
  - `/analyze` → `analyze.yml`
  - `/match_odds` → `match-odds.yml`
  - `/fetch_matches` → `fetch-matches-list.yml`
  - `/lottery` → `lottery.yml`
  - `/lottery_predict` → `lottery-predict.yml`
  - `/lottery_verify [region]` → `lottery-verify.yml` (truyền `inputs.region` nếu workflow hỗ trợ)
  - `/lottery_backfill [days]` → `lottery-backfill.yml` (truyền `inputs.days`)
- Gọi GitHub API:
  ```
  POST https://api.github.com/repos/<owner>/<repo>/actions/workflows/<file>/dispatches
  Authorization: Bearer <GITHUB_PAT>
  Body: { "ref": "main", "inputs": {...} }
  ```
- Trả lời lại Telegram ngay (vd "▶️ Đã kích hoạt analyze...") bằng cách gọi lại Telegram `sendMessage` API trực tiếp trong Edge Function (dùng `TELEGRAM_BOT_TOKEN`)
- Thêm lệnh `/help` liệt kê các lệnh khả dụng

### 2. Tạo GitHub Personal Access Token (PAT)
- Cần 1 **fine-grained PAT** chỉ với quyền `Actions: write` trên đúng repo này
- Lưu làm Supabase Edge Function secret: `supabase secrets set GITHUB_PAT=... GITHUB_OWNER=... GITHUB_REPO=...`
- **Không** đưa PAT vào code hay commit — chỉ qua `supabase secrets`

### 3. Deploy Edge Function
- `supabase functions deploy telegram-webhook --no-verify-jwt` (cần tắt JWT verify vì Telegram gọi không kèm Supabase JWT)
- Lấy URL function: `https://<project-ref>.functions.supabase.co/telegram-webhook`

### 4. Đăng ký webhook với Telegram
- Gọi 1 lần (thủ công, qua curl hoặc trình duyệt):
  ```
  https://api.telegram.org/bot<TOKEN>/setWebhook?url=<edge-function-url>&secret_token=<random-secret>
  ```
- Edge Function kiểm tra header `X-Telegram-Bot-Api-Secret-Token` khớp `secret_token` đã đăng ký để tránh giả mạo webhook

### 5. (Tuỳ chọn) Đảm bảo các workflow nhận input tham số
- `lottery-verify.yml` và `lottery-backfill.yml` đã có `workflow_dispatch` với input — kiểm tra lại tên input khớp với những gì Edge Function gửi
- Các workflow còn lại không cần input, chỉ cần trigger suông

## File liên quan
- Mới: `supabase/functions/telegram-webhook/index.ts`
- Tham khảo cấu trúc gửi tin nhắn: [src/shared/telegram.ts](src/shared/telegram.ts)
- Map lệnh ↔ workflow: [.github/workflows/*.yml](.github/workflows)
- Cập nhật `.env.example` / README: thêm ghi chú về `GITHUB_PAT`, cách set Supabase secrets, cách đăng ký webhook

### 6. Giao Codex CLI thực thi phần còn lại
Codex CLI (`codex-cli 0.142.4`) đã cài sẵn trên máy. Chạy:
```bash
codex exec "Thực thi plan tại H:\LeeSanHoon\auto-signal-bot\plans\telegram-command-trigger.md trong repo H:\LeeSanHoon\auto-signal-bot. Code Edge Function đã có sẵn tại supabase/functions/telegram-webhook/index.ts, không cần viết lại trừ khi phát hiện lỗi. Việc cần làm: (1) sửa văn phong README.md đoạn vừa thêm cho nhất quán tiếng Việt có dấu với phần còn lại; (2) kiểm tra supabase/config.toml đã tồn tại chưa, nếu chưa thì supabase init; (3) hướng dẫn/chuẩn bị các lệnh set secrets, deploy function, đăng ký webhook (KHÔNG tự ý chạy lệnh cần PAT/token thật của tôi — liệt kê lệnh để tôi tự chạy hoặc hỏi xác nhận trước khi chạy bất cứ lệnh nào đụng tới secrets/deploy/webhook thật)."
```
- Sau khi Codex chạy xong, quay lại đây để tôi review diff (`git diff`) trước khi bạn merge/deploy thật.
- Không để Codex tự ý chạy lệnh có chứa secrets thật (GITHUB_PAT, TELEGRAM_BOT_TOKEN...) mà không hỏi xác nhận trước.

## Kiểm thử
1. Deploy Edge Function, set webhook trỏ về nó
2. Gửi `/help` trong Telegram → bot phải trả lời danh sách lệnh trong vài giây
3. Gửi `/analyze` → kiểm tra tab Actions trên GitHub thấy workflow `analyze.yml` được trigger bởi "workflow_dispatch" gần như ngay lập tức
4. Gửi lệnh từ chat_id khác (hoặc giả lập) → xác nhận bị từ chối, không trigger gì
5. Kiểm tra log Edge Function (`supabase functions logs telegram-webhook`) để debug nếu lỗi
