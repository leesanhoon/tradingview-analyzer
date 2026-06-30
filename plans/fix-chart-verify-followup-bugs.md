# Fix 2 lỗi sau khi áp dụng flow: 3.5 Flash phân tích, 2.5 Pro → Claude verify

## Đã review
[src/charts/analyzer.ts](src/charts/analyzer.ts), [src/charts/index.ts](src/charts/index.ts),
[src/shared/telegram.ts](src/shared/telegram.ts) đã được cập nhật đúng theo plan
[chart-flow-3.5-analysis-pro-claude-verify.md](chart-flow-3.5-analysis-pro-claude-verify.md):
`ANALYSIS_MODEL` revert về `gemini-3.5-flash`, verify ưu tiên `gemini-2.5-pro` rồi fallback
`verifySetupWithClaude` khi Pro lỗi, `getVerifyProvider`/`VERIFY_PROVIDER` đã được gỡ khỏi
logic chọn verify. `npx tsc --noEmit` pass, không lỗi type.

Phát hiện 2 vấn đề cần sửa tiếp:

## 1. File bị hỏng encoding (mojibake) — BUG NGHIÊM TRỌNG
[src/charts/analyzer.ts:21](src/charts/analyzer.ts#L21) — chuỗi `USER_PROMPT` chứa đoạn tiếng
Việt `"tại/gần/xa EMA 20"` đã bị double-encode (UTF-8 bytes bị ghi lại như thể là Latin-1),
hiện đang là:
```
emaProximity (táº¡i/gáº§n/xa EMA 20)
```
Xác nhận bằng cách đọc raw bytes (`cat -A`), không phải lỗi hiển thị terminal/diff — bytes
trong file thực sự sai. Nguyên nhân khả năng cao: công cụ Codex dùng để sửa
`USER_PROMPT`/refactor đã ghi đè file với encoding không khớp UTF-8 gốc.

**Cần làm:**
- Sửa lại đúng chuỗi gốc: `emaProximity (tại/gần/xa EMA 20)`.
- Quét toàn bộ `analyzer.ts` (và các file khác Codex vừa sửa trong đợt này — `index.ts`,
  `telegram.ts`) để chắc chắn không còn chuỗi tiếng Việt nào khác bị hỏng tương tự
  (tìm pattern `Ã` hoặc `áº` lặp lại bất thường trong file là dấu hiệu mojibake).
- Sau khi sửa, mở file bằng editor xác nhận hiển thị đúng tiếng Việt có dấu, không chỉ dựa vào
  việc code biên dịch được (vì đây là string literal, TypeScript không báo lỗi dù nội dung
  sai).

## 2. Log/message gắn nhãn sai model khi verify fallback sang Claude
Khi `verifySetupWithGemini` (hàm gộp Pro-primary + Claude-fallback) phải fallback do Pro lỗi,
kết quả trả về **không cho biết model nào thực sự đã verify** — chỉ có
`{ confirmed, confidence, comment }`. Hậu quả: các nơi hiển thị log/message hiện **hard-code
"Gemini 2.5 Pro"** bất kể thực tế là Pro hay Claude đã verify:

- `confirmHighConfidenceSetups` trong [analyzer.ts](src/charts/analyzer.ts) (đoạn log
  `console.log` sau khi gọi verify) — luôn in `"Gemini 2.5 Pro confirmed/rejected"`.
- [telegram.ts](src/shared/telegram.ts) `buildConfirmationLine` (dòng ~193-196) — khi
  `verifiedConfirmed === true`, message Telegram luôn ghi
  *"✅ Đã xác nhận bởi Gemini 2.5 Pro"*, kể cả khi Claude mới là model thực sự xác nhận (sau khi
  Pro lỗi). Đây là thông tin sai hiển thị trực tiếp cho người dùng cuối qua Telegram.

**Cần làm:**
- Thêm field trả về tên model thực verify, ví dụ đổi kiểu trả về của `verifySetupWithGemini`
  thành `{ confirmed, confidence, comment, verifiedBy: string }` (`"gemini-2.5-pro"` hoặc
  `"claude-sonnet-4-6"` tuỳ nhánh nào thành công).
- Lan truyền `verifiedBy` lên `TradeSetup` (thêm field tương tự `verifiedConfirmed` hiện có
  trong [src/shared/types.ts](src/shared/types.ts), ví dụ `verifiedBy?: string`).
- Cập nhật `confirmHighConfidenceSetups` dùng `verification.verifiedBy` thay vì hard-code tên
  model trong log.
- Cập nhật `buildConfirmationLine` trong `telegram.ts` dùng `setup.verifiedBy` để hiển thị đúng
  tên model đã xác nhận (vd "Đã xác nhận bởi Gemini 2.5 Pro" hoặc "Đã xác nhận bởi Claude Sonnet
  4.6" tuỳ thực tế), thay vì câu cố định.
- Soát lại các đoạn text tương tự khác trong `telegram.ts` (`sendAllAnalyses`, header suffix,
  reason text ở dòng ~264-281) xem có cùng vấn đề hard-code "Gemini 2.5 Pro -> Claude Sonnet
  4.6" hay không — những đoạn mô tả *cấu hình chung* (luôn đúng vì mô tả thứ tự ưu tiên) thì
  giữ nguyên được, chỉ sửa những đoạn khẳng định *kết quả cụ thể* của 1 setup.

## File cần sửa
- [src/charts/analyzer.ts](src/charts/analyzer.ts)
- [src/shared/types.ts](src/shared/types.ts) (thêm field `verifiedBy`)
- [src/shared/telegram.ts](src/shared/telegram.ts)

## Verification
- `npx tsc --noEmit`.
- Đọc lại `USER_PROMPT` sau khi sửa, xác nhận tiếng Việt hiển thị đúng có dấu.
- Review thủ công đường fallback: giả lập Pro lỗi (hoặc đọc code đảm bảo catch đúng), xác nhận
  `verifiedBy` phản ánh đúng Claude trong trường hợp đó, và message Telegram khớp.
