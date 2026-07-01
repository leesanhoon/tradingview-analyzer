# Review findings — Phase 02: Structured logging

Review của các thay đổi trong [docs/tasks/02-structured-logging.md](02-structured-logging.md). Giao file này cho codex để xử lý fix.

## Đã verify OK
- `npm test` pass: 3 test files, 8 tests.
- `npx tsc --noEmit` không lỗi type.
- Không còn `console.log/error/warn` nào trong `src/` (đã grep xác nhận).
- [src/shared/logger.ts](../../src/shared/logger.ts): logger pino có redact theo key (`SENSITIVE_KEYS`) lẫn theo value (match chuỗi secret thực tế từ env), ghi warn/error vào Supabase `logs` qua `persistLog` (fire-and-forget, không block), bỏ qua nếu thiếu `SUPABASE_URL`/`SUPABASE_KEY`.
- Migration [supabase/migrations/20260701020000_create_logs_table.sql](../../supabase/migrations/20260701020000_create_logs_table.sql): bảng `logs` với index theo timestamp/level/source, RLS enabled.
- `pino`/`pino-pretty` đặt đúng trong `dependencies` (không phải devDependencies) vì cần chạy ở production.
- Diff các runner (`charts/index.ts`, `lottery-runner.ts`, ...) thay `console.log` → `logger.info/error` đúng ngữ nghĩa, giữ nguyên message, thêm structured context khi hợp lý.

## Update (review lần 4 — final)
BOM đã được strip khỏi toàn bộ 21 file, bao gồm file cuối cùng `src/scripts/setup-telegram-menu.ts`. Đã xác nhận lại bằng cách quét đầu file của toàn bộ file `src/` nằm trong diff — không còn file nào có `efbb bf`.

`npm test` (8/8 pass) và `npx tsc --noEmit` sạch. **Bug BOM đã được đóng.**

## Việc còn sót cần dọn
### 1. File tạm còn sót lại: `src/scripts/setup-telegram-menu.ts.nobom.tmp`
Đây là file rác sinh ra trong lúc xử lý BOM (nội dung giống hệt bản chính thức, đã diff xác nhận). Cần xóa file này, không commit theo.
- [ ] `rm src/scripts/setup-telegram-menu.ts.nobom.tmp`

### 2. (Minor, không bắt buộc) Một số message log vẫn giữ emoji + `\n` trong chuỗi
Ví dụ trong [src/lottery/lottery-runner.ts](../../src/lottery/lottery-runner.ts): `logger.info(\`🎰 Lottery History Scanner — ...\n\`)`. Không sai về chức năng (acceptance criteria chỉ yêu cầu thay console.log), nhưng lý tưởng nên tách phần biến động ra `context` thay vì nhúng trong message string, và bỏ `\n` thừa (logger đã tự xuống dòng). Có thể bỏ qua nếu không muốn tốn thêm effort.

## Việc cần làm cho codex
- [ ] Xóa file tạm `src/scripts/setup-telegram-menu.ts.nobom.tmp`.
- [ ] (Tuỳ chọn) Dọn message log còn emoji/`\n` thừa ở mục 2.
- [x] ~~Strip BOM khỏi 21 file~~ — hoàn tất, không cần làm thêm.
