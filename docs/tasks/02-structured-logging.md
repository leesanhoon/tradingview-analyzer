# Phase 02: Logging có cấu trúc

## Mục tiêu
Thay 121+ `console.log` rải rác trong `src/` bằng logger có cấu trúc (pino) + lưu vào bảng Supabase `logs`, để truy vết khi có sự cố thay vì chỉ trông cậy vào GitHub Actions log (mất sau thời gian retention).

## Bối cảnh / file liên quan
- Tập trung console.log nhiều nhất: [src/charts/test-analyze.ts](../../src/charts/test-analyze.ts) (29), [src/charts/index.ts](../../src/charts/index.ts) (12), [src/betting/odds-runner.ts](../../src/betting/odds-runner.ts) (11), [src/charts/test-model-compare.ts](../../src/charts/test-model-compare.ts) (9), [src/lottery/lottery-backtest-index.ts](../../src/lottery/lottery-backtest-index.ts) (8), [src/lottery/lottery-runner.ts](../../src/lottery/lottery-runner.ts) (7), [src/lottery/lottery-verify-runner.ts](../../src/lottery/lottery-verify-runner.ts) (6), [src/lottery/lottery-predict-resync-index.ts](../../src/lottery/lottery-predict-resync-index.ts) (6), [src/charts/check-open-trades-runner.ts](../../src/charts/check-open-trades-runner.ts) (6).
- [src/shared/db.ts](../../src/shared/db.ts): nơi khởi tạo Supabase client, là chỗ hợp lý để thêm logger ghi vào bảng `logs`.
- Repo **chưa có `supabase/migrations`** — cần tạo migration mới cho bảng `logs`.

## Việc cần làm
- [ ] Thêm `pino` (+ `pino-pretty` cho dev) vào dependencies.
- [ ] Tạo module logger dùng chung (vd `src/shared/logger.ts`) export instance pino cấu hình theo env (pretty ở local, JSON ở CI).
- [ ] Thiết kế + tạo migration bảng Supabase `logs` (cột: timestamp, level, message, context/jsonb, source).
- [ ] Thêm transport/hook để logger ghi đồng thời vào Supabase `logs` (ít nhất cho level warn/error).
- [ ] Thay thế `console.log`/`console.error` trong các file liệt kê ở trên bằng logger mới, theo từng module (chart, betting, lottery).
- [ ] Đảm bảo không log secret/API key.

## Acceptance criteria
- [ ] Không còn `console.log` trong `src/` (trừ script CLI thuần debug nếu cố ý giữ, cần ghi rõ lý do).
- [ ] Lỗi runtime trong các runner chính (chart, betting, lottery) được ghi vào bảng `logs` với đủ context để debug.
- [ ] Build/lint không lỗi sau khi thay đổi.

## Ghi chú / rủi ro
- Cần cân nhắc chi phí ghi log vào Supabase (số lượng request) — có thể giới hạn chỉ ghi level >= warn vào DB, info/debug chỉ ra console/CI log.
