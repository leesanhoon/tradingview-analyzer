# Chuẩn hoá cấu hình model AI: chỉ dùng gemini-3.5-flash + gemini-2.5-pro (Claude giữ lại cho tương lai)

## Context

Hệ thống hiện dùng lẫn lộn nhiều model: `gemini-2.5-flash`, `gemini-3.5-flash`, `gemini-2.5-pro`, và `claude-sonnet-4-6` rải rác ở 3 luồng (chart analysis, betting odds, position verify). User muốn thu gọn về đúng 2 model chính cho toàn hệ thống ngay bây giờ:

- **gemini-3.5-flash** — bước check/phân tích ban đầu (nhanh, rẻ)
- **gemini-2.5-pro** — bước verify/xác nhận độc lập (chính xác hơn)

Claude Sonnet sẽ được dùng sau này (dự định chuyển từ `gemini-2.5-pro` sang `claude-sonnet-4-6` ở vai trò verify). Vì vậy giữ nguyên code fallback/switch sang Claude (`verify-provider.ts`, các model Claude trong `.env`), chỉ đảm bảo nó đang tắt qua `VERIFY_PROVIDER=gemini` — không xoá code, không cần sửa gì thêm ở phần đó vì nó đã đúng.

Việc cần làm là **chuẩn hoá các model identifier không nhất quán** để toàn bộ 3 luồng đều dùng đúng cặp flash/pro nói trên.

## Thay đổi cụ thể

### 1. `.env` và `.env.example`

- `GEMINI_MODEL=gemini-2.5-flash` → đổi thành `GEMINI_MODEL=gemini-3.5-flash` (đây là model mặc định dùng cho bước check ban đầu của betting, đang bị lệch chuẩn).
- Các dòng còn lại (`CHART_VERIFY_MODEL_PRIMARY`, `CHART_ANALYSIS_MODEL`, `POSITION_VERIFY_MODEL_GEMINI`, `BETTING_VERIFY_MODEL_PRIMARY`, `BETTING_VERIFY_MODEL_FALLBACK`) đã đúng cặp flash/pro — giữ nguyên.
- Giữ nguyên `CHART_VERIFY_MODEL_CLAUDE`, `POSITION_VERIFY_MODEL_CLAUDE`, `VERIFY_PROVIDER=gemini` (đã tắt Claude qua config, phục vụ chuyển đổi sau này).

### 2. [src/betting/betting-gemini.ts](src/betting/betting-gemini.ts:10)

- Dòng 10: `const DEFAULT_MODEL = "gemini-2.5-flash";` → đổi thành `"gemini-3.5-flash"` để khớp với `GEMINI_MODEL` mới và đồng bộ với `CHART_ANALYSIS_MODEL` / `VERIFY_MODEL_FALLBACK` đang dùng `gemini-3.5-flash`.
- Không đổi gì khác trong file này — `VERIFY_MODEL_PRIMARY`/`VERIFY_MODEL_FALLBACK` đã đúng chuẩn.

### 3. Rà soát không cần sửa (đã đúng chuẩn)

- [src/charts/analyzer.ts](src/charts/analyzer.ts:13) và [src/charts/index.ts](src/charts/index.ts:14): `ANALYSIS_MODEL`/`CHART_ANALYSIS_MODEL` mặc định `gemini-3.5-flash` — giữ nguyên.
- [src/charts/verify-provider.ts](src/charts/verify-provider.ts): logic switch Claude/Gemini — giữ nguyên nguyên vẹn cho việc chuyển đổi tương lai.
- [src/shared/ai-usage.ts](src/shared/ai-usage.ts:84): bảng giá đã có sẵn cho cả `gemini-2.5-flash`, `gemini-3.5-flash`, `gemini-2.5-pro`, `claude-sonnet-4-6` — không cần sửa vì vẫn cần track chi phí kể cả model không dùng activate hiện tại.

## Không đổi

- Không xoá code liên quan Claude (theo yêu cầu user, giữ để chuyển sang sonnet-4-6 sau này).
- Không đổi logic 2 bước check→verify hiện có ở cả 3 luồng, vì thứ tự flash-check-trước, pro-verify-sau đã đúng ý user.

## Kiểm tra sau khi sửa

1. `npx tsc --noEmit` để đảm bảo không có lỗi type sau khi đổi hằng số.
2. Grep lại toàn repo (`gemini-2.5-flash`) để xác nhận không còn model lệch chuẩn nào sót lại ngoài bảng giá ở `ai-usage.ts`.
3. Nếu có thể, chạy thử 1 luồng betting hoặc chart analysis (script `test-model-compare.ts` hoặc entrypoint hiện có) để xác nhận request thực sự gọi đúng `gemini-3.5-flash` rồi `gemini-2.5-pro`, dựa trên log `createLogger`.
