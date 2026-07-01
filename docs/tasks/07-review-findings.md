# Review findings — Phase 07: Backtesting (Forex/Betting)

Review của các thay đổi liên quan tới [docs/tasks/07-backtesting.md](07-backtesting.md). **Không phát hiện bug chức năng.**

## Đã verify OK
- [src/charts/forex-backtest.ts](../../src/charts/forex-backtest.ts): tính `directionAccuracy`, `entryHitRate`, `averageRealizedRiskReward`, tổng hợp theo cặp — dựa trên dữ liệu đã có từ Phase 06 (`realizedRiskRewardRatio`, `closeReason`), không tính toán trùng lặp.
- [src/betting/betting-backtest.ts](../../src/betting/betting-backtest.ts): so khớp `preferredScoreline` snapshot với tỷ số thực tế sau trận, có `normalizeScoreline` chuẩn hoá cả 2 phía trước khi so sánh — tránh false-negative do format khác nhau (`"1-0"` vs `"1:0"` vs có khoảng trắng).
- Migration [supabase/migrations/20260701153000_betting_analysis_snapshots.sql](../../supabase/migrations/20260701153000_betting_analysis_snapshots.sql): bảng `betting_analysis_snapshots` với `game_id unique` (dùng `upsert onConflict: game_id` — không tạo bản ghi trùng khi phân tích lại cùng trận).
- [betting-api.ts](../../src/betting/betting-api.ts) — `fetchFixtureResult()` mới thêm vẫn đi qua `fetchJson()` đã được rate-limit từ Phase 04, không bypass rate limiter.
- `odds-runner.ts` wire đúng: lưu snapshot phân tích ngay sau khi Gemini phân tích xong, trước khi gửi Telegram — không bỏ sót trận nào.
- 2 script mới (`npm run forex-backtest`, `npm run betting-backtest`) theo đúng pattern hiện có trong `package.json`.
- Test mới ([tests/charts/forex-backtest.test.ts](../../tests/charts/forex-backtest.test.ts), [tests/betting/betting-backtest.test.ts](../../tests/betting/betting-backtest.test.ts)) cover đúng logic tính toán.
- `npm test` (10 files, 29 tests pass), `npx tsc --noEmit` sạch.

## Ghi chú (không phải bug — chỉ về đặt tên, cân nhắc nếu muốn rõ ràng hơn)
- **`entryHit`** trong `ForexBacktestRow` được định nghĩa là `(tp1ClosedPercent > 0) || closeReason === "take_profit_2"` — tức đo việc "giá có chạy tới TP1/TP2 trước khi đóng" chứ không phải nghĩa thông thường của "entry hit" (lệnh limit/entry order được khớp giá). Tên field dễ gây hiểu lầm cho người đọc report sau này tưởng đang đo tỷ lệ lệnh được khớp entry. Có thể đổi tên thành `reachedTakeProfit` hoặc `setupValidated` cho rõ nghĩa hơn — không bắt buộc, chỉ là gợi ý đặt tên.
- **`directionCorrect`** = `realizedRiskRewardRatio > 0` — về bản chất là "trade có lãi" (đã có sẵn ở `wins` trong `PerformanceSummary` từ Phase 06), không hẳn tách biệt được "AI đọc đúng hướng thị trường" khỏi "quản lý lệnh tốt" (vd partial TP1 ăn non rồi bị stop breakeven vẫn tính là trade có lãi nhẹ = "direction correct", dù nếu không chốt non có thể đã âm). Đây là lựa chọn mô hình hoá hợp lý với dữ liệu hiện có (không có cách nào tốt hơn để tách 2 yếu tố này mà không lưu thêm dữ liệu giá tại nhiều mốc thời gian), không phải lỗi — chỉ ghi chú để hiểu đúng ý nghĩa con số khi đọc report.

## Việc còn lại theo task doc (không phải code)
- [ ] Lottery: chạy `runBacktest()` trên dữ liệu thật, ghi lại kết quả so với baseline — đây là việc "chạy và quan sát", không phải code, cần người vận hành thực hiện thủ công (task doc đã để đúng trạng thái chưa tick).
- **Update:** đã thử chạy `npm run lottery-backtest` với timeout dài trong session này nhưng job không hoàn tất — không ghi nhận kết quả giả định. Nguyên nhân nhiều khả năng là sandbox không có/không tới được mạng ra Supabase (nếu thiếu credentials, `getDb()` throw ngay chứ không treo — nên treo lâu gợi ý là vấn đề mạng), cộng thêm việc script chạy grid-search nặng (~7580 lượt gọi `runBacktest()` cho 3 miền). Cần chạy lại ở môi trường có mạng thật (máy local hoặc GitHub Actions) để có số liệu thật trước khi đánh giá `lottery-predict.ts` có vượt baseline hay không. Chi tiết xem [07-backtesting.md](07-backtesting.md).
