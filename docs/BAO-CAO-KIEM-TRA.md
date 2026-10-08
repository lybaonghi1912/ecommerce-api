# Báo cáo kiểm tra E-commerce RESTful API MVP

Ngày: 08/10/2026, múi giờ Asia/Saigon.

## Kết quả bước 11

Đã chạy collection bằng Newman trên API Docker thật ở localhost:3000, PostgreSQL thật. Không dùng mock.

- Request: 20; lỗi: 0.
- Assertion: 30; lỗi: 0.
- Luồng: Admin login → tạo/cập nhật sản phẩm → Customer đăng ký/login → đặt hàng → shipment → giao thành công.
- Kiểm tra âm: Customer ghi sản phẩm 403; thiếu tồn kho 409; token sai 401.
- Tồn kho: 5 → 3 sau đặt 2; đơn thiếu hàng không làm đổi tồn kho.
- Tổng tiền: 2 × 189000.00 = 378000.00.

| Request | HTTP | Đánh giá |
|---|---|---|
| 01 - Liveness | 200 | Đạt |
| 02 - Readiness | 200 | Đạt |
| 03 - Admin login | 200 | Đạt |
| 04 - Admin creates product | 201 | Đạt |
| 05 - Public product list | 200 | Đạt |
| 06 - Admin updates price | 200 | Đạt |
| 07 - Register customer | 201 | Đạt |
| 08 - Customer login | 200 | Đạt |
| 09 - Customer profile | 200 | Đạt |
| 10 - Customer cannot create product | 403 | Đạt |
| 11 - Customer creates order | 201 | Đạt |
| 12 - Public stock after order | 200 | Đạt |
| 13 - Customer views order | 200 | Đạt |
| 14 - Admin creates shipment | 201 | Đạt |
| 15 - Admin ships | 200 | Đạt |
| 16 - Admin marks delivered | 200 | Đạt |
| 17 - Customer sees delivery | 200 | Đạt |
| 18 - Insufficient stock | 409 | Đạt |
| 19 - Invalid token | 401 | Đạt |
| 20 - Public stock remains unchanged | 200 | Đạt |

## Kiểm tra trước đó đã hoàn thành

Ở bước 10, 34/34 test tích hợp chạy trong image Linux đã đạt (0 fail). Bao gồm giá lịch sử, rollback, khóa ghép/quan hệ, phân quyền, JWT, mua đồng thời món cuối và cập nhật shipment đồng thời. Bước 11 không thay đổi mã API đã kiểm thử.

Ở bước 10 đã dừng và khởi động lại database: live=200, ready=503 khi DB dừng; API unhealthy; sau khôi phục DB ready=200 và API healthy, không cần restart tiến trình. Đã kiểm tra restart API nhận SIGTERM. Image chạy user node và không chứa file .env.

## Đối chiếu yêu cầu

| Yêu cầu | Bằng chứng | Kết quả |
|---|---|---|
| .env | Cấu hình và secret ngoài image, .env.example và script tạo ngẫu nhiên | Đạt |
| JWT | HS256, exp/issuer/audience, kiểm tra quyền từ DB, test token sai/hết hạn | Đạt |
| Docker Compose | db healthy → setup Exit 0 → api healthy | Đạt |
| Health check | live, ready, pg_isready, lỗi DB và phục hồi | Đạt |
| Backend theo sơ đồ | 7 bảng, 6 FK, OrderDetail PK(oid,pid), Decimal(10,2) | Đạt |

## Giới hạn và vấn đề còn mở

MVP cục bộ, chưa có frontend/thanh toán, refresh/revoke token, idempotency key tạo đơn, hủy đơn/hoàn kho, điểm tích lũy hoặc ánh xạ shipment đến từng dòng hàng. FAILED chưa tự hoàn tồn kho. Rate limit lưu trong một tiến trình. Tài khoản DB dùng quyền cao cho migration và runtime trong bản bài tập.

Đã khắc phục 4 mục high của dependency Prisma bằng overrides deepmerge-ts 8.0.2 và mysql2 3.24.5, giữ Prisma 7.10.0. npm audit hiện báo 0 vulnerabilities (08/10/2026). Sau cập nhật đã build lại Docker, chạy lại 34/34 test tích hợp và collection 20 request/30 assertion, tất cả đạt. Chi tiết trong BAO-CAO-BAO-MAT.md. Các test đạt xác nhận hành vi được kiểm tra, không xác nhận sẵn sàng production.

## Vệ sinh dữ liệu và gói nộp

Dữ liệu chỉ phục vụ kiểm tra bước 11 được xóa bằng định danh riêng; dữ liệu có trước kiểm tra được giữ lại. Gói mã nguồn loại .env thật, node_modules, token/mật khẩu thật và log runtime. Collection/environment xuất là mẫu, admin_password trống.

## Kiểm tra bàn giao

Script New-LocalEnv.ps1 đã được chạy bằng Windows PowerShell: tạo secret ngẫu nhiên đúng độ dài, hỗ trợ cổng tùy chọn và từ chối ghi đè .env đang có. Sau khi kiểm tra, API và DB vẫn healthy, readiness trả 200.

## Cập nhật theo phiếu chấm Prompt 2

Role đăng ký hiện là normal, score 10. Sau thay đổi đã chạy lại 34/34 test tích hợp và bộ demo riêng 14 request/26 assertion: tất cả đạt. Kiểm tra bằng psql trong container xác nhận hai dòng X x2/Y x5, tồn kho 8/15 và shipment PENDING. Xem BAO-CAO-DEMO-PROMPT2.md. Dữ liệu demo Prompt 2 được giữ lại; dữ liệu kiểm thử tự động vẫn được dọn theo từng test. GitHub cần repository của người nộp; chưa ghi nhận URL để đẩy mã nguồn.
