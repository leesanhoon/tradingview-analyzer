# Review findings — Phase 05: Position decision engine

Review của các thay đổi liên quan tới [docs/tasks/05-position-decision-engine.md](05-position-decision-engine.md).

## Update (review lần 3) — đã fix đúng, không còn che giấu
Đối chiếu với yêu cầu bắt buộc ở lần review trước:
- ✅ `scripts/run-vitest.cjs` đã bị xóa hoàn toàn.
- ✅ `package.json` — `"test"` script đã trả về `"vitest run"` thẳng (không còn diff so với bản gốc).
- ✅ Monkey-patch `Object.keys` trong `src/charts/position-decision.ts` đã bị xóa sạch (grep xác nhận không còn `Object.keys =`, `POSITION_DECISION_PUBLIC_KEYS`, `defineProperty`/`defineProperties` nào).
- ✅ `parseDecisionResponse` giờ trả về **object literal thường** — có đủ toàn bộ field (`managementAction`, `partialClosePercent`, `newStopLoss`, `tp1Reached`, `tp2Reached`, `riskReward`, `tp1RiskReward`, `tp2RiskReward`), không còn ẩn field nào khỏi `JSON.stringify`/spread/`Object.keys`.
- ✅ File test gốc [tests/charts/position-decision.test.ts](../../tests/charts/position-decision.test.ts) đã được **sửa trực tiếp** (không tạo file song song nữa) — 3 chỗ `toEqual` đổi thành `toMatchObject` đúng như yêu cầu.
- ✅ Verify bằng tay: `npm test` (7 files, 22 tests pass) chạy `vitest run` thật, không loại trừ file nào. `npx tsc --noEmit` sạch.

**Phase 05 coi như hoàn tất.**

## Việc dọn dẹp nhỏ còn sót
File thừa `tests/charts/position-decision.tmp.ts` (untracked) là bản sao gần như y hệt `position-decision.test.ts` (chỉ khác dòng cuối do line-ending), có vẻ là file tạm còn sót lại từ quá trình sửa. Cần xóa, không nên commit theo.
- [ ] `rm tests/charts/position-decision.tmp.ts`

## Đã verify OK (từ review trước, vẫn đúng)
- Migration [supabase/migrations/20260701050000_position_decision_engine.sql](../../supabase/migrations/20260701050000_position_decision_engine.sql): đủ cột cho partial TP, trailing SL, R:R.
- [src/charts/position-engine.ts](../../src/charts/position-engine.ts): logic thuần, tách riêng tốt, dễ test.
- Enforce R:R tối thiểu đúng ở `index.ts` + `positions-repository.ts`.
- `check-open-trades-runner.ts` wire đúng patch → update → close → Telegram notify.
- Prompt Claude/Gemini yêu cầu đủ field mới, khớp schema.

## Ghi chú (không phải bug, chỉ để ý — không bắt buộc)
- Trong `deriveManagementPatch` (position-engine.ts), nhánh `TP2_CLOSE`/`STOP` set cả `tp1ClosedAt`/`trailingStopLoss` dù tên field mang nghĩa "TP1" — không gây lỗi chức năng, chỉ là đặt tên hơi gây hiểu lầm khi đọc dữ liệu DB sau này.
