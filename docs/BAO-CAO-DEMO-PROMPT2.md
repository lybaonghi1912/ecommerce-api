# Báo cáo chạy demo Prompt 2

Ngày 08/10/2026. Collection chạy qua Newman trên API Docker và PostgreSQL thật. Không mock.

- Role mặc định normal, membership BASIC score 10: đạt ở đăng ký, đăng nhập và DB.
- 34/34 kiểm thử tích hợp sau thay đổi: đạt.
- Demo: 14 requests, 26 assertions, 0 lỗi.
- Sản phẩm tạo bằng PostgreSQL CLI: X pid=62, Y pid=63.
- Đơn oid=33; tài khoản prompt2_1791448487777_7913; createat=2026-10-08T08:34:49.117Z.
- X: mua 2, giá 100000.00, tồn kho 10 → 8.
- Y: mua 5, giá 200000.00, tồn kho 20 → 15.
- Tổng: 1200000.00; hai dòng OrderDetail.
- Shipment shipid=25, PENDING; Admin tạo sau khi đặt hàng và Customer xem được trong đơn.
- Dữ liệu demo được giữ lại cho truy vấn CLI. Không xuất token/password vào báo cáo.

| Request | HTTP | Kết quả |
|---|---|---|
| 01 - Live | 200 | Đạt |
| 02 - Ready | 200 | Đạt |
| 03 - CLI product X before order | 200 | Đạt |
| 04 - CLI product Y before order | 200 | Đạt |
| 05 - Register normal score 10 | 201 | Đạt |
| 06 - Login and display token | 200 | Đạt |
| 07 - Order without token is rejected | 401 | Đạt |
| 08 - Order X x2 and Y x5 | 201 | Đạt |
| 09 - View order and details | 200 | Đạt |
| 10 - X remaining 8 | 200 | Đạt |
| 11 - Y remaining 15 | 200 | Đạt |
| 12 - Admin login to arrange shipment | 200 | Đạt |
| 13 - Move successful order to shipment | 201 | Đạt |
| 14 - Customer displays Shipment | 200 | Đạt |

## Lệnh kiểm tra dữ liệu demo hiện tại

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Check-Prompt2.ps1 -OrderId 33 -ProductX 62 -ProductY 63
```

Kỳ vọng prompt2_demo_pass=t. Với lượt mới, dùng các ID thực tế của lượt đó. GitHub: [https://github.com/lybaonghi1912/ecommerce-api](https://github.com/lybaonghi1912/ecommerce-api), nhánh main công khai; đã kiểm tra danh sách file không có .env thật. Điểm do giảng viên quyết định.
