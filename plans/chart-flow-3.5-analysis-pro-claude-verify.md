# Chart flow: 3.5 Flash phân tích, 2.5 Pro verify trước → fallback Claude Sonnet 4.6

## Context (cập nhật quyết định mới nhất)
Quyết định trước đó (plan
[chart-analysis-switch-to-gemini-2.5-flash.md](chart-analysis-switch-to-gemini-2.5-flash.md))
đã đổi model phân tích chính sang `gemini-2.5-flash` và đã được áp dụng vào
[src/charts/analyzer.ts](src/charts/analyzer.ts). Sau khi test bằng
`npm run test-model-compare` và thấy ảnh fixture không đủ thông tin (không có trục giá) khiến
không đánh giá được, người dùng quyết định đổi hướng:

- **Bước phân tích chính**: quay lại dùng `gemini-3.5-flash` (revert thay đổi trước).
- **Bước verify**: dùng **Gemini 2.5 Pro làm primary**, nếu Pro lỗi (network/parse-fail) thì
  **fallback sang Claude Sonnet 4.6** — KHÔNG còn dùng `gemini-3.5-flash` làm verify fallback
  như cấu hình hiện tại ([analyzer.ts:9,207-223](src/charts/analyzer.ts#L9)).
- Khi được hỏi rõ logic kết hợp 2 model verify, người dùng xác nhận: **ưu tiên 2.5 Pro trước**
  (không phải chạy song song rồi lấy AND/OR/trung bình) — tức đúng pattern fallback tuần tự đã
  dùng ở bên betting/verify trước đó, chỉ đổi model fallback từ Flash sang Claude.

## Approach

### 1. Revert model phân tích chính về `gemini-3.5-flash`
Trong [analyzer.ts](src/charts/analyzer.ts):
- Đổi `const ANALYSIS_MODEL = "gemini-2.5-flash";` (dòng 10) trở lại
  `const ANALYSIS_MODEL = "gemini-3.5-flash";` — hoặc xoá hằng số riêng và dùng thẳng chuỗi
  như code gốc, miễn giữ nguyên hành vi (model literal dùng trong `analyzeWithGemini`).
- Giữ nguyên việc dùng `buildGenerationConfig(ANALYSIS_MODEL, 4000)` cho request phân tích —
  vẫn hợp lý để đảm bảo JSON ổn định và đủ token, không liên quan tới việc chọn model nào.
- Cập nhật lại 2 dòng log ở `analyzeAllCharts` (hiện đang nội suy theo `ANALYSIS_MODEL`,
  dòng ~320-322) cho khớp lại "Gemini 3.5 Flash".

### 2. Đổi verify fallback từ Flash sang Claude Sonnet 4.6
Hiện tại `verifySetupWithGemini` ([analyzer.ts:207-223](src/charts/analyzer.ts#L207)) thử
`VERIFY_MODEL_PRIMARY` ("gemini-2.5-pro"), lỗi thì fallback `VERIFY_MODEL_FALLBACK`
("gemini-3.5-flash"), tách biệt hoàn toàn khỏi `verifySetupWithClaude`
([analyzer.ts:154-205](src/charts/analyzer.ts#L154)) — 2 hàm này hiện được chọn loại trừ nhau
qua `getVerifyProvider()` (`VERIFY_PROVIDER` env: "claude" hoặc "gemini") trong
`confirmHighConfidenceSetups` ([analyzer.ts:275-315](src/charts/analyzer.ts#L275)).

Cần thay đổi để **luôn ưu tiên Pro trước, fallback Claude khi Pro lỗi**, bất kể
`VERIFY_PROVIDER` đang set gì (vì giờ đây không còn là "chọn 1 trong 2 provider" mà là
"chuỗi ưu tiên cố định"). Cách làm:
- Viết hàm mới `verifySetup(setup, chart)` (tên gợi ý) gộp logic: gọi
  `verifySetupWithGeminiModel(setup, buffer, VERIFY_MODEL_PRIMARY, ai)`
  ([analyzer.ts:225-269](src/charts/analyzer.ts#L225), hàm này đã có sẵn và đã đúng pattern,
  không cần viết lại) trong try/catch; nếu lỗi, log cảnh báo rồi gọi
  `verifySetupWithClaude(setup, chart)` làm fallback.
- Trong `confirmHighConfidenceSetups`, thay đoạn chọn provider qua `getVerifyProvider()`
  (dòng ~290-296) bằng việc gọi thẳng `verifySetup(setup, chart)` mới này. Có thể giữ
  `getVerifyProviderLabel`/`VERIFY_PROVIDER` cho mục đích hiển thị label khác (xem mục 4) nếu
  cần, nhưng **logic chọn model verify không còn phụ thuộc env var này nữa**.
- `VERIFY_MODEL_FALLBACK = "gemini-3.5-flash"` không còn dùng cho verify — có thể xoá hằng số
  này nếu không còn nơi nào tham chiếu, hoặc giữ lại nếu vẫn dùng ở chỗ khác trong file (kiểm
  tra trước khi xoá để tránh lỗi biên dịch).

### 3. Cập nhật `buildGenerationConfig`
Hàm này hiện rẽ nhánh theo `model === VERIFY_MODEL_PRIMARY` để set `thinkingBudget: 128` +
`maxOutputTokens >= 900` cho Pro, còn lại set `thinkingBudget: 0`
([analyzer.ts:50-72](src/charts/analyzer.ts#L50)) — logic này **không cần đổi**, vẫn đúng vì
Pro vẫn là `VERIFY_MODEL_PRIMARY` như cũ, chỉ có model fallback đổi từ Flash sang Claude (Claude
dùng client/API riêng, không đi qua `buildGenerationConfig` của Gemini).

### 4. Rà soát các nơi khác đang dùng `getVerifyProvider`/`getVerifyProviderLabel`
Các file sau cũng tham chiếu khái niệm "verify provider" theo kiểu chọn 1-trong-2
(gemini/claude) — cần Codex kiểm tra xem có cần cập nhật text/label cho khớp flow mới
("Gemini 2.5 Pro → Claude Sonnet 4.6 fallback") hay không, **phạm vi nhỏ, chỉ sửa nếu hiển thị
sai gây hiểu nhầm cho người dùng**, không bắt buộc đổi logic chọn provider ở các nơi này nếu
chúng dùng cho mục đích khác (vd quyết định đóng lệnh):
- [src/charts/position-decision.ts:192](src/charts/position-decision.ts#L192) — dùng
  `getVerifyProvider()` cho logic riêng (xem ngữ cảnh trước khi đổi, có thể không liên quan
  trực tiếp tới verify setup mới mở).
- [src/charts/index.ts:27](src/charts/index.ts#L27) — log dùng
  `getVerifyProviderLabel()`, nên cập nhật hoặc thay bằng text cố định
  "Gemini 2.5 Pro (fallback Claude Sonnet 4.6)" để khớp flow thật.
- [src/shared/telegram.ts:195,269](src/shared/telegram.ts#L195) — tương tự, kiểm tra ngữ cảnh
  hiển thị cho người dùng cuối, cập nhật label nếu cần.

### 5. `test-model-compare.ts`
Không cần đổi cấu trúc script ([src/charts/test-model-compare.ts](src/charts/test-model-compare.ts))
vì nó vốn đã so sánh độc lập cả 3 model (Pro/Flash/Claude) — vẫn hữu ích để xem chất lượng
từng model riêng lẻ. Chỉ cần sửa label cũ "Gemini 3.5 Flash" ở dòng skip-message
([test-model-compare.ts:150](src/charts/test-model-compare.ts#L150)) cho khớp lại đúng model
phân tích chính (`gemini-3.5-flash` — giờ lại đúng như cũ nên thực ra dòng này tự nhiên khớp
lại, không cần sửa nữa sau khi revert bước 1). Vẫn giữ nguyên vấn đề đã nêu ở plan trước
([fix-test-model-compare-no-setup.md](fix-test-model-compare-no-setup.md)) về việc cần fixture
ảnh có trục giá để có setup thật để test.

## File cần sửa
- [src/charts/analyzer.ts](src/charts/analyzer.ts) — revert `ANALYSIS_MODEL`, thêm hàm
  `verifySetup` gộp Pro-primary/Claude-fallback, sửa `confirmHighConfidenceSetups` gọi hàm mới
  thay vì rẽ nhánh theo `getVerifyProvider()`.
- [src/charts/index.ts](src/charts/index.ts), [src/shared/telegram.ts](src/shared/telegram.ts) —
  cập nhật label hiển thị nếu cần (không bắt buộc về mặt logic).

## Verification
- `npx tsc --noEmit`.
- Review thủ công: xác nhận `confirmHighConfidenceSetups` không còn phụ thuộc
  `VERIFY_PROVIDER` env var để chọn model verify (logic giờ cố định Pro→Claude), và đường lỗi
  Pro thật sự rơi vào nhánh gọi Claude (không bị nuốt exception sai chỗ — tham khảo lại cách
  `verifySetupWithGemini` cũ đã làm đúng việc này với Flash, áp dụng tương tự cho Claude).
- Không cần gọi API thật để review code; muốn xác nhận thực tế dùng `npm run test-model-compare`
  sau khi có fixture ảnh đủ thông tin (trục giá + symbol).
