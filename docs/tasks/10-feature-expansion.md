# Phase 10: Mở rộng tính năng

## Mục tiêu
Tăng giá trị sản phẩm: thêm khung thời gian khác ngoài H4, đa dạng hoá nguồn xác nhận tín hiệu. Ưu tiên thấp — chỉ làm sau khi các phase độ tin cậy/lõi nghiệp vụ đã ổn định.

## Bối cảnh / file liên quan
- [src/charts/analyzer.ts](../../src/charts/analyzer.ts): logic phân tích chart hiện chạy trên khung H4.
- [src/charts/charts.config.ts](../../src/charts/charts.config.ts): cấu hình chart (symbol, timeframe...).
- [src/charts/screenshot.ts](../../src/charts/screenshot.ts): chụp ảnh chart qua Playwright — cần mở rộng để chụp nhiều khung thời gian.

## Việc cần làm
### Đa khung thời gian
- [x] Thêm cấu hình M15 (vào lệnh chính xác hơn) và D1 (xác nhận xu hướng lớn) trong `charts.config.ts`.
- [x] Mở rộng `screenshot.ts` để chụp thêm các khung thời gian mới.
- [x] Cập nhật `analyzer.ts` để kết hợp phân tích đa khung thời gian (multi-timeframe confluence) thay vì chỉ H4 đơn lẻ.

### Đa dạng hoá nguồn xác nhận tín hiệu
- [x] Nghiên cứu thêm chỉ báo volume vào phân tích.
- [x] Thiết kế logic confluence: chỉ phát tín hiệu khi nhiều khung thời gian/chỉ báo đồng thuận, giảm false positive.

### Đa kênh thông báo
- [x] Thiết kế interface chung cho "notifier" (hiện đang gắn cứng với Telegram trong nhiều file).

## Acceptance criteria
- [ ] Tín hiệu mới có xác nhận multi-timeframe, giảm rõ rệt số lượng tín hiệu sai so với baseline H4-only (đo qua [Phase 07 - backtesting](07-backtesting.md)).

## Ghi chú / rủi ro
- Đây là nhóm "nice to have" — nên triển khai sau khi Phase 01–08 (độ tin cậy, lõi nghiệp vụ, backtesting, observability) đã hoàn thiện để có baseline đo lường hiệu quả thay đổi.
