# Fix: `npm run test-model-compare` báo "không có setup" ở mọi model

## Đã review những gì hiện có
- [src/charts/analyzer.ts](src/charts/analyzer.ts): `ANALYSIS_MODEL = "gemini-2.5-flash"`
  ([analyzer.ts:10](src/charts/analyzer.ts#L10)) đã được áp dụng đúng theo plan trước, dùng
  `buildGenerationConfig` cho cả analysis lẫn verify, `maxOutputTokens: 4000` cho analysis.
  `npx tsc --noEmit` pass, không lỗi type.
- [src/charts/test-model-compare.ts](src/charts/test-model-compare.ts): đọc ảnh từ
  `test-charts/` (hiện có `test-charts/image.png`), gọi `analyzeAllCharts([screenshot])` 1 lần
  để lấy setup ứng viên, rồi mới so sánh verify qua 3 model (Pro/Flash/Claude).

## Nguyên nhân thực sự của "không có setup"
Trong `compareForScreenshot` ([test-model-compare.ts:145-155](src/charts/test-model-compare.ts#L145)):
```ts
const analysis = await analyzeAllCharts([screenshot]);
if (analysis.setups.length === 0) {
  console.log("No setup >=70% found from Gemini 3.5 Flash analysis. Skipping compare.");
  ...
  return;   // <- thoát luôn, KHÔNG BAO GIỜ gọi verify Pro/Flash/Claude
}
```
Script chỉ chạy **1 lần** bước phân tích chính (`analyzeAllCharts`, dùng `ANALYSIS_MODEL`) để
tìm setup ứng viên. Nếu bước này trả về 0 setup (confidence < 70%), code `return` ngay —
**3 model verify (Pro/Flash/Claude) không hề được gọi**. Việc người dùng thấy "tất cả model
báo không có setup" thực chất là **1 model duy nhất** (model phân tích chính) quyết định
không có setup đạt ngưỡng, chứ không phải 3 model verify đều từ chối.

Khả năng cao nguyên nhân gốc: ảnh `test-charts/image.png` (ảnh chart người dùng paste) **không
có trục giá (price axis)** và không có tên symbol/cặp tiền hiển thị trên ảnh — chỉ có nến +
đường EMA. Trong khi đó `USER_PROMPT`
([analyzer.ts:22](src/charts/analyzer.ts#L22)) yêu cầu model phải:
> "Provide specific price levels from the chart for entry, stopLoss, and takeProfits"

Không có trục giá thì model không thể tự tin đưa ra mức giá cụ thể → hợp lý khi model trả về
confidence thấp hoặc loại bỏ setup, dẫn đến `analyzeAllCharts` trả về 0 setup. Đây không phải
lỗi do đổi model sang `gemini-2.5-flash`, mà là giới hạn của ảnh fixture so với ảnh chart thật
từ TradingView (luôn có trục giá + label symbol) dùng trong production.

## Việc cần làm cho Codex

### 1. Bug nhỏ: label sai trong thông báo skip
[test-model-compare.ts:150](src/charts/test-model-compare.ts#L150) vẫn hard-code
`"Gemini 3.5 Flash"` trong khi `analyzeAllCharts` giờ dùng `gemini-2.5-flash`
(`ANALYSIS_MODEL`). Sửa thông báo cho khớp, lý tưởng là import/dùng tên model thật thay vì
chuỗi cứng, để không bị lệch lần sau khi đổi model.

### 2. Decouple bước verify khỏi kết quả phân tích chính (việc chính)
Mục tiêu gốc của script là **so sánh chất lượng verify giữa 3 model** trên cùng 1 setup đã biết
trước (Sonnet 4.6 đã xác nhận thủ công) — không phụ thuộc việc `ANALYSIS_MODEL` có tự tìm ra
setup đó hay không. Cần thêm đường fallback:
- Cho phép cung cấp 1 `TradeSetup` thủ công đi kèm ảnh, ví dụ qua file sidecar
  `test-charts/image.setup.json` (cùng tên với ảnh, đổi đuôi `.json`), chứa các field tối
  thiểu: `pair`, `direction`, `setup`, `entry`, `stopLoss`, `takeProfit1`, `takeProfit2`,
  `confidence`, `reasons`.
- Trong `compareForScreenshot`: nếu `analyzeAllCharts` trả về 0 setup, thử đọc file sidecar
  tương ứng; nếu có, dùng setup đó để chạy tiếp phần so sánh verify (Pro/Flash/Claude) thay vì
  `return` sớm. Nếu không có sidecar, giữ hành vi `return` + log như cũ (đã đúng).
- Mục đích: cho phép test verify model ngay cả khi ảnh fixture không đủ thông tin (không trục
  giá) để model phân tích chính tự tìm ra setup từ đầu.

### 3. (Tuỳ chọn, không bắt buộc) Cải thiện log chẩn đoán
`analysis.noSetupReason` đã được log khi có ([test-model-compare.ts:151-153](src/charts/test-model-compare.ts#L151))
— giữ nguyên, nhưng nếu Codex muốn chẩn đoán sâu hơn có thể log thêm số `summaries` trả về
(`analysis.summaries.length`) để biết model có "nhìn thấy" được pair nào không, hay hoàn toàn
không nhận diện được gì từ ảnh.

## File liên quan
- [src/charts/test-model-compare.ts](src/charts/test-model-compare.ts)
- [src/charts/analyzer.ts](src/charts/analyzer.ts) (chỉ đọc, không cần sửa thêm)
- Ảnh fixture: `test-charts/image.png` (đã có sẵn, không cần đổi)

## Verification
- `npx tsc --noEmit`.
- Chạy lại `npm run test-model-compare`: nếu thêm sidecar JSON cho `image.png` với setup mẫu
  khớp với nhận định Sonnet 4.6 đã xác nhận, xác nhận bảng so sánh Pro/Flash/Claude in ra được
  (không còn bị skip sớm).
