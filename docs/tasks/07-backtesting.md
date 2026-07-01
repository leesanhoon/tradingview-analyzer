# Phase 07: Backtesting

## Mục tiêu
Lottery đã có cơ chế backtest hoàn chỉnh — cần rà soát/đánh giá độ chính xác thực tế. Forex/betting hiện không có cách nào đánh giá retroactive xem AI phân tích đúng bao nhiêu % — cần xây cơ chế backtest dùng dữ liệu lịch sử đã lưu trong Supabase.

## Bối cảnh / file liên quan
- [src/lottery/lottery-backtest.ts](../../src/lottery/lottery-backtest.ts): **đã implement đầy đủ** — export `runBacktest()`, `BacktestReport`, `BacktestOptions`; thực hiện walk-forward validation so với baseline hypergeometric (`hypergeometricAtLeastOneHit`). Không phải khung dở dang.
- [src/lottery/lottery-backtest-index.ts](../../src/lottery/lottery-backtest-index.ts): entry point wire `runBacktest`, chạy qua `npm run lottery-backtest`.
- [src/lottery/lottery-predictions-repository.ts](../../src/lottery/lottery-predictions-repository.ts), [src/lottery/lottery-repository.ts](../../src/lottery/lottery-repository.ts): nguồn dữ liệu lịch sử lottery.
- Forex: [src/charts/positions-repository.ts](../../src/charts/positions-repository.ts) (bảng `open_positions`) — chưa có cơ chế backtest.
- Betting: [src/betting/match-repository.ts](../../src/betting/match-repository.ts) (bảng `matches`) — chưa có cơ chế backtest.

## Việc cần làm
### Lottery (rà soát, không phải xây mới)
- [ ] Chạy `runBacktest()` trên toàn bộ lịch sử hiện có, ghi lại kết quả thực tế (hit rate so với baseline). **Chưa chạy được trong môi trường session này** — đã thử `npm run lottery-backtest` với timeout dài nhưng job không hoàn tất. Nguyên nhân nhiều khả năng:
  - Sandbox hiện tại không có/không tới được kết nối mạng ra Supabase (nếu thiếu `SUPABASE_URL`/`SUPABASE_KEY`, `getDb()` trong [src/shared/db.ts](../../src/shared/db.ts) throw lỗi **ngay lập tức**, không hề treo — nên việc treo timeout dài gợi ý là do mạng, không phải thiếu cấu hình).
  - Bản thân `lottery-backtest-index.ts` chạy grid-search khá nặng: 3 miền × 360 tổ hợp tham số (decay/overdueBonus/weightedGap/spread) × 7 ngày trong tuần ≈ **7580 lượt gọi `runBacktest()`** — cần chạy ở môi trường có đủ thời gian/tài nguyên và kết nối mạng ổn định tới Supabase (local dev machine hoặc GitHub Actions), không nên chạy trong sandbox hạn chế mạng.
  - Đề xuất: chạy lại lệnh này ở môi trường có mạng thật (máy local với `.env` đúng, hoặc thêm 1 job GitHub Actions tạm để chạy 1 lần), hoặc tạm thời giảm kích thước lưới tham số trong `makeGridCandidates()` để smoke-test nhanh trước khi chạy full grid.
- [ ] Đánh giá xem mô hình dự đoán có thực sự vượt baseline ngẫu nhiên hay không; nếu không, cân nhắc điều chỉnh `lottery-predict.ts`. (Phụ thuộc vào việc chạy được backtest ở trên — chưa có số liệu thật để đánh giá.)

### Forex
- [x] Thiết kế cơ chế backtest: lấy các lệnh đã đóng trong `open_positions`, so sánh quyết định AI tại thời điểm đó với kết quả thực tế.
- [x] Viết hàm tính tỷ lệ AI dự đoán đúng hướng/đúng entry so với giá thực tế sau đó.

### Betting
- [x] Thiết kế cơ chế backtest tương tự dùng bảng `matches` — lưu snapshot AI, rồi so sánh preferred scoreline với kết quả trận đấu thực tế từ API-Football.

## Acceptance criteria
- [ ] Có báo cáo backtest lottery chạy được và cho kết quả rõ ràng (hit rate vs baseline).
- [x] Có cơ chế backtest mới cho Forex và betting, chạy được trên dữ liệu lịch sử thực trong Supabase, output là % độ chính xác.

## Ghi chú / rủi ro
- Cần đủ dữ liệu lịch sử (đủ số lệnh/trận đã đóng) để kết quả backtest có ý nghĩa thống kê — kiểm tra số lượng bản ghi hiện có trước khi đầu tư xây cơ chế phức tạp.
