# Bug: `npm run test-model-compare` báo "No setup" do sai MIME type ảnh fixture

## Lỗi gặp phải
```
No setup >=70% found from Gemini 3.5 Flash analysis. Skipping compare.
```
Trong khi đó, khi người dùng tự upload cùng file ảnh lên Gemini 3.5 Flash (qua AI Studio/chat
chính thức), model đọc đúng và xác nhận có setup.

## Root cause — xác nhận bằng kiểm tra thực tế
1. File fixture thực tế là **PNG**, không phải JPEG:
   ```
   $ file test-charts/image.png
   test-charts/image.png: PNG image data, 458 x 304, 8-bit/color RGB, non-interlaced
   ```
   (magic bytes `89 50 4E 47` = PNG signature thật, dù tên file có đuôi `.png` đúng).

2. Nhưng `analyzeWithGemini` trong [src/charts/analyzer.ts:134](src/charts/analyzer.ts#L134)
   **hard-code MIME type khi gửi ảnh lên Gemini**:
   ```ts
   inlineData: { mimeType: "image/jpeg", data: screenshot.buffer.toString("base64") },
   ```
   Bất kể buffer thực sự là định dạng gì, code luôn khai báo `"image/jpeg"`. Khi gửi bytes PNG
   nhưng khai `mimeType: "image/jpeg"`, Gemini sẽ cố decode sai định dạng → không đọc được
   nội dung ảnh đúng cách (hoặc đọc ra dữ liệu rác) → model hợp lý khi không tìm thấy setup nào
   đạt ngưỡng confidence, dù về mặt kỹ thuật vẫn trả JSON hợp lệ (`setups: []`), nên không có
   exception nào được ném ra để báo lỗi rõ ràng.

3. Vì sao production (`captureAllCharts`) không gặp lỗi này: ảnh chart thật trong production
   được Playwright chụp bằng `page.screenshot({ type: "jpeg", quality: ... })`
   ([src/charts/screenshot.ts:111-115](src/charts/screenshot.ts#L111)) — tức luôn **thực sự
   là JPEG**, nên hard-code `mimeType: "image/jpeg"` ở `analyzer.ts` trùng khớp với dữ liệu
   thật và không gây lỗi. Lỗi chỉ lộ ra khi dùng ảnh fixture PNG cho test harness mới
   (`test-model-compare.ts`) — đây là gap giữa giả định "ảnh luôn là JPEG" (đúng cho
   production) và thực tế của ảnh test (PNG do người dùng paste).

4. `verifySetupWithGeminiModel` ([analyzer.ts:231](src/charts/analyzer.ts#L231)) cũng hard-code
   `mimeType: "image/jpeg"` tương tự — cùng vấn đề tiềm ẩn cho bước verify nếu sau này dùng
   ảnh không phải JPEG.

## Việc cần làm cho Codex

### 1. Sửa gốc: xác định MIME type động theo dữ liệu ảnh thật, không hard-code
- Thêm 1 helper nhỏ tự nhận diện định dạng ảnh từ magic bytes của buffer (hoặc đơn giản hơn,
  từ phần mở rộng file nếu có `filepath`/tên file đáng tin cậy), ví dụ:
  ```ts
  function detectImageMimeType(buffer: Buffer): string {
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return "image/png";
    }
    return "image/jpeg"; // mặc định, khớp hành vi production hiện tại (luôn jpeg)
  }
  ```
- Áp dụng helper này ở cả 2 chỗ hard-code: [analyzer.ts:134](src/charts/analyzer.ts#L134)
  (`analyzeWithGemini`) và [analyzer.ts:231](src/charts/analyzer.ts#L231)
  (`verifySetupWithGeminiModel`).
- Không cần đổi `ScreenshotResult` type hay luồng production (vẫn luôn JPEG thật, hành vi
  không đổi) — chỉ thêm khả năng tự nhận diện đúng khi gặp định dạng khác, để test harness
  dùng ảnh PNG hoạt động đúng.

### 2. (Tuỳ chọn) Áp dụng tương tự cho Claude verify
[analyzer.ts:177](src/charts/analyzer.ts#L177) (`verifySetupWithClaude`) cũng hard-code
`media_type: "image/jpeg"` khi gửi ảnh cho Claude — cùng class bug, nên sửa đồng bộ bằng
helper ở trên để nhất quán, tránh lặp lại vấn đề tương tự khi verify bằng Claude trên ảnh
PNG.

## File cần sửa
- [src/charts/analyzer.ts](src/charts/analyzer.ts) — 3 vị trí hard-code MIME type:
  `analyzeWithGemini` (dòng 134), `verifySetupWithGeminiModel` (dòng 231),
  `verifySetupWithClaude` (dòng 177).

## Verification
- `npx tsc --noEmit`.
- Chạy lại `npm run test-model-compare` với `test-charts/image.png` (file PNG thật), xác nhận
  `analyzeAllCharts` giờ tìm được setup (không còn báo "No setup >=70% found" một cách giả
  tạo do sai MIME type).
- Xác nhận production flow không bị ảnh hưởng: ảnh JPEG thật từ `captureAllCharts` vẫn được
  nhận diện đúng là `image/jpeg` qua helper mới (test bằng cách kiểm tra buffer JPEG có magic
  bytes `FF D8 FF` thay vì PNG).
