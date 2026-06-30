# Phase 06: Theo dõi hiệu suất

## Mục tiêu
Thêm bảng/báo cáo win-rate, R:R thực tế, drawdown theo cặp tiền — gửi tổng kết định kỳ qua Telegram (tuần/tháng).

## Bối cảnh / file liên quan
- [src/charts/positions-repository.ts](../../src/charts/positions-repository.ts): nguồn dữ liệu lệnh đã đóng/đang mở (bảng `open_positions`).
- [src/shared/telegram.ts](../../src/shared/telegram.ts): helper gửi message Telegram, dùng để gửi báo cáo định kỳ.
- [src/charts/check-open-trades-runner.ts](../../src/charts/check-open-trades-runner.ts): runner hiện có, tham khảo pattern để tạo runner báo cáo mới (vd `performance-report-runner.ts`).
- Phụ thuộc Phase 05 nếu đã thêm partial TP — ảnh hưởng cách tính kết quả lệnh.

## Việc cần làm
- [ ] Thiết kế cách tính win-rate, R:R thực tế, drawdown từ dữ liệu `open_positions` đã đóng.
- [ ] Viết hàm tổng hợp theo cặp tiền (group by symbol) và tổng hợp toàn portfolio.
- [ ] Tạo runner mới (vd `src/charts/performance-report-runner.ts`) chạy theo lịch GitHub Actions (tuần/tháng).
- [ ] Format báo cáo gửi Telegram (win-rate %, R:R trung bình, max drawdown, theo từng cặp).
- [ ] Thêm workflow GitHub Actions schedule mới cho báo cáo định kỳ (cron weekly/monthly).
- [ ] (Tuỳ chọn) Thêm lệnh Telegram để gọi báo cáo theo yêu cầu, liên kết với [Phase 09 - /stats](09-stats-command.md).

## Acceptance criteria
- [ ] Chạy thử runner cho dữ liệu mẫu ra đúng số liệu win-rate/R:R/drawdown kỳ vọng.
- [ ] Báo cáo Telegram gửi đúng định dạng, dễ đọc, đúng lịch.
- [ ] Có unit test cho hàm tính toán (không phụ thuộc Telegram/network thật).

## Ghi chú / rủi ro
- Drawdown cần định nghĩa rõ (theo equity curve giả lập hay theo số dư thực) trước khi implement — nên thống nhất với người dùng nếu chưa rõ công thức.
