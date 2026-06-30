# Chart setup verify: ưu tiên Gemini 2.5 Pro, fallback sang 3.5 Flash

## Context
Phần phân tích chart trong [src/charts/analyzer.ts](src/charts/analyzer.ts) có cơ chế verify
độc lập cho các setup confidence cao, hỗ trợ 2 provider: Claude (`verifySetupWithClaude`) và
Gemini (`verifySetupWithGemini`, dòng 160-226), chọn qua `getVerifyProvider()`. Hiện
`verifySetupWithGemini` gọi thẳng `gemini-3.5-flash`, không có fallback.

Cùng thời điểm này, phần betting/odds ([src/betting/betting-gemini.ts](src/betting/betting-gemini.ts))
đã được nâng cấp verify để ưu tiên `gemini-2.5-pro` (mạnh hơn, chất lượng cao hơn), fallback
sang `gemini-3.5-flash` nếu Pro lỗi — kèm theo 2 fix quan trọng để tránh lỗi
`Unexpected end of JSON input` đã gặp thực tế trước đó:
1. `gemini-2.5-pro` mặc định bật "thinking" (suy luận nội bộ) tiêu tốn token trước khi sinh
   JSON output — nếu không giới hạn thinking budget và không tăng `maxOutputTokens` đủ lớn,
   response bị cụt, JSON.parse throw.
2. Parse response phải có try/catch riêng (không throw thẳng), để lỗi parse-fail cũng kích
   hoạt được nhánh fallback model, không chỉ lỗi network/HTTP mới fallback.

Người dùng muốn áp dụng đúng pattern này (Pro primary + Flash fallback, cùng 2 fix trên)
cho `verifySetupWithGemini` trong charts.

## Approach
Tham chiếu cách làm đã verify hoạt động đúng trong `betting-gemini.ts`
(`buildGenerationConfig`, `parseVerificationResponse`, `callVerifyModel` pattern,
`VERIFY_MODEL_PRIMARY`/`VERIFY_MODEL_FALLBACK`) và áp dụng tương tự vào `analyzer.ts`:

1. **Thêm hằng số model** (đầu file hoặc gần các hằng số khác trong `analyzer.ts`):
   ```ts
   const VERIFY_MODEL_PRIMARY = "gemini-2.5-pro";
   const VERIFY_MODEL_FALLBACK = "gemini-3.5-flash";
   ```

2. **Thêm helper build generation config theo model** (giống `buildGenerationConfig` trong
   `betting-gemini.ts`):
   - Với `gemini-2.5-pro`: set `thinkingConfig: { thinkingBudget: 128 }` và nâng
     `maxOutputTokens` lên tối thiểu 900 (thay vì 500 hiện tại).
   - Với model khác (flash): set `thinkingConfig: { thinkingBudget: 0 }`, giữ
     `maxOutputTokens: 500` như cũ.
   - Giữ nguyên `temperature: 0.2`, `topP: 0.9`, `responseMimeType: "application/json"`.

3. **Thêm helper parse an toàn cho response verify** (giống `parseVerificationResponse`):
   - Bọc `JSON.parse` trong try/catch, trả `null` thay vì throw khi parse fail.
   - Trả về `{ confirmed, confidence, comment }` khi parse thành công (logic giống code hiện
     tại trong `verifySetupWithGemini`, chỉ tách ra thành hàm riêng có safety net).

4. **Sửa `verifySetupWithGemini`** (dòng 160-226):
   - Tham số `model` cần truyền được vào phần build request (model ảnh hưởng cả tên model gọi
     lẫn generation config).
   - Gói "gọi API qua `withRetry` + parse an toàn" thành 1 hàm nội bộ nhận `model: string`,
     dùng lại được cho cả 2 lần gọi (Pro và Flash) — tương tự `callVerifyModel` trong
     `betting-gemini.ts`.
   - Logic: thử gọi `VERIFY_MODEL_PRIMARY` trước (qua `withRetry`, giữ nguyên cơ chế retry lỗi
     tạm thời hiện có). Nếu lệnh gọi ném lỗi HOẶC parse JSON sau đó thất bại (hàm nội bộ nên
     `throw` khi parse fail để bắt được ở catch ngoài), bắt lỗi, log cảnh báo, rồi gọi lại với
     `VERIFY_MODEL_FALLBACK` qua `withRetry` một lần nữa.
   - Nếu fallback cũng lỗi, ném lỗi ra ngoài như hành vi gốc (không có fallback thứ 3).
   - Không đổi chữ ký hàm `verifySetupWithGemini(setup, chart)` — caller (`runVerification`
     hoặc tương đương quanh dòng 228+) không cần sửa.

5. **Không đổi** `verifySetupWithClaude` và `analyzeWithGemini` (model `gemini-3.5-flash`
   dùng cho phân tích chính ban đầu) — chỉ phạm vi thay đổi là hàm verify bằng Gemini.

## File cần sửa
- [src/charts/analyzer.ts](src/charts/analyzer.ts) — chỉ sửa trong file này: thêm hằng số
  model, helper build config, helper parse an toàn, và sửa nội dung `verifySetupWithGemini`
  (dòng ~160-226).

## Verification
- `npx tsc --noEmit` để đảm bảo không lỗi type.
- Review thủ công: đảm bảo lỗi parse-fail (không phải chỉ lỗi network) cũng kích hoạt đúng
  nhánh fallback sang Flash, tránh lặp lại lỗi `Unexpected end of JSON input` đã từng gặp ở
  phần betting trước khi được fix.
- Không cần gọi API thật trong quá trình review code (tốn quota, cần ảnh chart thật) — xác
  nhận qua đọc code và type-check là đủ ở bước này.
