# Fix: chia nhỏ main chart analysis theo từng pair để tránh 503 quá tải

## Vấn đề
`analyzeAllCharts` trong [src/charts/analyzer.ts](../src/charts/analyzer.ts:394) gọi `analyzeWithGemini` **một lần duy nhất** với TOÀN BỘ screenshot của mọi pair (9 pairs × 3 timeframe = 27 ảnh) nhét chung vào 1 request Gemini (`ANALYSIS_MODEL = gemini-3.5-flash`). Payload quá lớn trong 1 call khiến:
- Dễ bị Google trả về `503 UNAVAILABLE` (quá tải) khi request nặng.
- `withRetry` chỉ thử lại 3 lần (2s/4s) rồi throw fatal, làm cả run (`src/charts/index.ts`) crash toàn bộ — 1 lần lỗi là mất luôn kết quả của tất cả 9 pairs, kể cả pairs không liên quan.

Log lỗi thực tế: `charts:analyzer` main analysis 503 UNAVAILABLE sau 2 lần retry → `charts:index` fatal error → `process.exit(1)`.

## Hướng fix
Tách `analyzeWithGemini`/`analyzeAllCharts` để phân tích **theo từng pair riêng** (3 ảnh D1/H4/M15 mỗi lần) thay vì gộp hết vào 1 request, tương tự cách `confirmHighConfidenceSetups` đã làm cho bước verify (loop từng setup, try/catch riêng, 1 pair lỗi không sập cả run).

### Thay đổi trong `src/charts/analyzer.ts`

1. Thêm hàm group screenshots theo pair (dùng `screenshot.chart.name.replace(\` \${screenshot.chart.timeframe}\`, "")` — pattern đã dùng ở dòng 404 trong `analyzeAllCharts` hiện tại).

2. Đổi `analyzeWithGemini(screenshots: ScreenshotResult[])` để nhận screenshots của **1 pair** thay vì toàn bộ (không cần đổi logic bên trong, chỉ đổi input — payload nhỏ hơn tự động nhờ ít ảnh hơn).

3. Đổi `analyzeAllCharts`:
   - Group screenshots theo pair.
   - Loop từng pair, gọi `analyzeWithGemini` + `parseAnalysisResponse` riêng, bọc `try/catch`:
     - Lỗi (kể cả sau khi hết retry) → log warning, bỏ qua pair đó, tiếp tục pair tiếp theo (không throw fatal).
   - Gộp `summaries`/`setups` từ tất cả pairs thành kết quả cuối, giữ nguyên logic lọc `confluenceSetups` (yêu cầu đủ D1/H4/M15) đang có ở dòng 409-414.
   - Nếu TẤT CẢ pairs đều lỗi thì mới throw (để `index.ts` biết toàn bộ run fail thật sự).

4. Giữ nguyên `withConfiguredRateLimit`/`withRetry` per-call như hiện tại (áp dụng tự nhiên cho từng pair).

### Không đổi
- `confirmHighConfidenceSetups` (verify step) — đã per-setup, không cần sửa.
- `buildSystemPrompt`/`buildUserPrompt` — prompt vẫn work cho input nhỏ hơn (1 pair thay vì 9).
- `src/charts/index.ts` — logic gọi `analyzeAllCharts` không đổi, chỉ hưởng lợi vì lỗi 1 pair không còn làm crash toàn bộ.
- Model config (`gemini-3.5-flash` cho analysis, `gemini-2.5-pro` verify) — không đổi, đây là fix về batching/resilience, không phải đổi model.

## Kiểm tra
1. `npx tsc --noEmit`.
2. Test thủ công bằng `src/charts/test-analyze.ts` hoặc `test-model-compare.ts` (đã có sẵn) để xác nhận kết quả phân tích từng pair vẫn đúng format, và tổng hợp summaries/setups từ nhiều pair không bị trùng/thiếu.
3. Mô phỏng lỗi (throw giả trong 1 pair) để xác nhận các pair khác vẫn chạy tiếp và trả kết quả, thay vì crash toàn bộ.
