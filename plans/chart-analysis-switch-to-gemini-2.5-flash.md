# Phân tích chart: đổi model nhận định sang Gemini 2.5 Flash, giữ verify bằng 2.5 Pro

## Context
Flow phân tích chart hiện tại trong [src/charts/analyzer.ts](src/charts/analyzer.ts):
1. `analyzeWithGemini()` (dòng 124-152) — model nhận định chính đang hard-code
   `"gemini-3.5-flash"` ([analyzer.ts:137](src/charts/analyzer.ts#L137)), trả về toàn bộ
   `summaries` + `setups`, lọc setup có `confidence >= 70` trong `parseAnalysisResponse`.
2. [src/charts/index.ts:25-32](src/charts/index.ts#L25) — chỉ những setup `confidence > 80`
   mới được đưa qua `confirmHighConfidenceSetups()` → verify bằng
   `VERIFY_MODEL_PRIMARY = "gemini-2.5-pro"` (fallback `gemini-3.5-flash` nếu Pro lỗi, đã làm
   xong ở [analyzer.ts:207-269](src/charts/analyzer.ts#L207)) hoặc Claude, tuỳ
   `getVerifyProvider()`.

Người dùng muốn: **model nhận định ban đầu (phán đoán setup có đúng hay không) đổi từ
`gemini-3.5-flash` sang `gemini-2.5-flash`**, rồi mới gửi sang `gemini-2.5-pro` để verify như
hiện tại. Đây là **flow khác với betting**: bên betting khi bị Pro/Flash verify từ chối thì có
bước `reviseMatchAnalysis` để sinh lại nhận định mới; bên chart **không có** bước revise — nếu
verify không confirm thì giữ nguyên `verifiedConfirmed = false`/`undefined`, không tạo nhận
định thay thế. Plan này chỉ đổi model ở bước nhận định ban đầu, **không** thêm revise step cho
chart.

## Approach
1. **Thêm hằng số `ANALYSIS_MODEL`** cạnh `VERIFY_MODEL_PRIMARY`/`VERIFY_MODEL_FALLBACK`
   ([analyzer.ts:8-9](src/charts/analyzer.ts#L8)):
   ```ts
   const ANALYSIS_MODEL = "gemini-2.5-flash";
   ```

2. **Sửa `analyzeWithGemini`** ([analyzer.ts:124-152](src/charts/analyzer.ts#L124)):
   - Đổi `model: "gemini-3.5-flash"` thành `model: ANALYSIS_MODEL`.
   - Thêm `config` cho request, tái dùng `buildGenerationConfig(ANALYSIS_MODEL, <maxTokens>)`
     đã có sẵn ([analyzer.ts:50-72](src/charts/analyzer.ts#L50)) — vì hàm này tự động set
     `thinkingConfig: { thinkingBudget: 0 }` cho mọi model khác `VERIFY_MODEL_PRIMARY`, tránh
     đúng lỗi "thinking nuốt hết output token" từng gặp khi đổi sang model dòng 2.5.
   - Chọn `maxOutputTokens` đủ lớn cho output gồm nhiều `summaries` + `setups` cùng lúc (hiện
     tại request không giới hạn token, dựa vào default của model) — đề xuất tối thiểu `4000`
     để an toàn, có thể điều chỉnh nếu thực tế cần nhiều hơn (nhiều cặp tiền tệ).
   - Lưu ý: `buildGenerationConfig` set `responseMimeType: "application/json"` — đây là thay
     đổi tích cực (ép JSON output ổn định hơn), không phải hành vi phụ ngoài ý muốn, vì
     `parseAnalysisResponse` đã luôn kỳ vọng JSON.

3. **Cập nhật log/label** để khớp model thật đang dùng:
   - [analyzer.ts:318,320](src/charts/analyzer.ts#L318) trong `analyzeAllCharts`:
     `"  -> Trying Gemini 3.5 Flash..."` / `"  ✓ Analyzed by Gemini 3.5 Flash"` → đổi thành
     `"Gemini 2.5 Flash"` (hoặc nội suy từ `ANALYSIS_MODEL` để tránh lệch lần sau).

4. **Không đổi**:
   - Logic verify (`verifySetupWithGemini`, `verifySetupWithGeminiModel`,
     `confirmHighConfidenceSetups`) — đã đúng pattern Pro-primary/Flash-fallback.
   - Ngưỡng lọc setup (`confidence >= 70` lúc parse, `confidence > 80` lúc quyết định có verify
     hay không ở `index.ts`) — không nằm trong yêu cầu lần này.
   - Không thêm bước revise nào cho chart (khác biệt có chủ đích so với betting).

## File cần sửa
- [src/charts/analyzer.ts](src/charts/analyzer.ts) — thêm hằng số `ANALYSIS_MODEL`, sửa
  `analyzeWithGemini` dùng model + config mới, cập nhật log trong `analyzeAllCharts`.

## Verification
- `npx tsc --noEmit` để đảm bảo không lỗi type.
- Review thủ công: đảm bảo `maxOutputTokens` đủ lớn để không cắt cụt JSON khi nhiều cặp tiền
  tệ được phân tích cùng lúc (đây chính là lỗi đã gặp trước đó với verify Pro, cần tránh lặp
  lại ở bước analysis).
- Không cần gọi API thật khi review code; nếu muốn xác nhận chất lượng thực tế, dùng lại
  `npm run test-analyze` ([test-analyze.ts](src/charts/test-analyze.ts)) với ảnh chart mẫu
  trong `test-charts/` sau khi đổi model.
