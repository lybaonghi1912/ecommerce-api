# Hướng dẫn chạy và demo E-commerce RESTful API MVP

Ngày kiểm tra: 08/10/2026. Stack: Node.js 24, Express 5, Prisma 7.10.0, PostgreSQL 17.

## 1. Chuẩn bị trên máy mới

Giải nén mã nguồn. Mở PowerShell tại thư mục có compose.yaml. Cài và mở Docker Desktop, dùng Linux containers. Node.js 24 chỉ cần khi chạy API hoặc kiểm thử trực tiếp trên máy.

Tạo cấu hình riêng:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\New-LocalEnv.ps1
```

Lệnh trên chỉ áp dụng ExecutionPolicy cho tiến trình chạy script này. Script không thay đổi chính sách máy, không ghi đè .env đang có; tạo mật khẩu database, mật khẩu admin và JWT secret ngẫu nhiên. Xem ADMIN_PASSWORD bằng Notepad trên máy của bạn. Không đưa .env vào bài nộp.

Nếu cổng 3000/5432 đã được dùng, tạo cấu hình với cổng khác:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\New-LocalEnv.ps1 -Port 3002 -PostgresPort 5433
```

Đánh giá: .env tồn tại; JWT secret có ít nhất 32 byte; DATABASE_URL dùng localhost và cổng PostgreSQL đã chọn. Compose tự dùng db:5432 trong container.

## 2. Khởi động hệ thống

```powershell
docker compose up -d --build --wait
docker compose ps -a
```

Thứ tự: db healthy → setup chạy migration và seed → api healthy. setup Exited (0) nghĩa là thành công. Không đổi phiên bản major Prisma/PostgreSQL tùy ý.

Đánh giá: api và db healthy; setup mã thoát 0. Migration tạo 7 bảng nghiệp vụ và bảng quản lý _prisma_migrations. Volume giữ dữ liệu khi container được dừng/tạo lại.

## 3. Kiểm tra health

```powershell
curl.exe --noproxy "*" -i http://localhost:3000/health/live
curl.exe --noproxy "*" -i http://localhost:3000/health/ready
```

Thay 3000 nếu đã đổi PORT. live xác nhận tiến trình còn phản hồi; ready truy vấn SELECT 1. Database hoạt động: cả hai trả 200. Database ngừng: live vẫn 200, ready 503. Health check đánh dấu unhealthy; bản thân nhãn unhealthy không tự restart container. restart: unless-stopped xử lý khi tiến trình thoát.

Thử lỗi có kiểm soát trên môi trường bài tập, rồi khôi phục:

```powershell
docker compose stop db
curl.exe --noproxy "*" -i http://localhost:3000/health/ready
docker compose start --wait db
```

Đánh giá: ready chuyển 503 rồi phục hồi 200; dữ liệu admin vẫn còn.

## 4. Import và chạy Postman

Import hai file JSON collection và environment kèm theo. Chọn environment Local. Điền admin_username và admin_password bằng giá trị trong .env, chỉ trên máy cá nhân. Đổi base_url nếu PORT khác. Collection v2.1 dùng request và test script thông thường; không yêu cầu Native Git.

Chạy toàn collection từ 01 đến 20 bằng Collection Runner hoặc gửi lần lượt. Request 01 tạo username demo mới; request đăng nhập tự lưu token; các request tạo dữ liệu tự lưu pid/oid/shipid. Chạy từ đầu mỗi lần demo.

Luồng: health → Admin login → tạo và cập nhật sản phẩm → Customer đăng ký/login → profile → kiểm tra cấm quyền Admin → tạo đơn → kiểm tra tồn kho → tạo shipment → SHIPPED → DELIVERED → Customer xem giao hàng → kiểm tra thiếu tồn kho và token sai.

Đánh giá: tạo sản phẩm 201; Customer ghi sản phẩm 403; đơn qty=2 có tổng 378000.00 và tồn kho 5→3; giao hàng DELIVERED; thiếu tồn kho 409 không làm giảm tồn kho; token sai 401. Dữ liệu demo do bạn chạy được giữ lại để trình bày. Đừng xuất lại environment/collection sau demo để chia sẻ token hoặc mật khẩu.

## 5. API và quyền

| Method | Endpoint | Quyền | Thành công |
|---|---|---|---|
| POST | /api/auth/register | Công khai | 201 |
| POST | /api/auth/login | Công khai | 200 |
| GET | /api/users/me | Đã đăng nhập | 200 |
| GET | /api/products?page=1&limit=20 | Công khai | 200 |
| GET | /api/products/:pid | Công khai | 200 |
| POST | /api/products | Admin | 201 |
| PATCH | /api/products/:pid | Admin | 200 |
| POST | /api/orders | Customer | 201 |
| GET | /api/orders | Chủ đơn / Admin | 200 |
| GET | /api/orders/:oid | Chủ đơn / Admin | 200 |
| POST | /api/orders/:oid/shipments | Admin | 201 |
| PATCH | /api/shipments/:shipid | Admin | 200 |
| GET | /health/live | Công khai | 200 |
| GET | /health/ready | Công khai | 200 / 503 |

Header API bảo vệ: Authorization: Bearer <accessToken>. JWT HS256 hết hạn sau 900 giây theo .env; đăng nhập lại khi hết hạn. Mật khẩu không nằm trong response hoặc JWT. Middleware đọc quyền hiện tại trong database.

## 6. Body mẫu

Đăng ký:
```json
{"username":"customer_demo","fullname":"Khách hàng","password":"DemoPassword_2026!"}
```

Sản phẩm:
```json
{"pname":"Bàn phím","price":"199000.00","quantity":5}
```

Giá phải là chuỗi từ 0 đến 99999999.99, tối đa 2 chữ số thập phân. quantity là số nguyên không âm. PATCH chỉ thay các trường được gửi; quantity là tồn kho mới tuyệt đối.

Đặt hàng (thay pid bằng ID thực tế):
```json
{"items":[{"pid":1,"qty":2}]}
```

Không gửi uid hoặc giá. 1–50 sản phẩm khác nhau, qty nguyên từ 1 đến 1000000. Giá được lưu tại thời điểm đặt; tổng là chuỗi tiền. Transaction Serializable và trừ tồn kho có điều kiện chống bán vượt kho.

Tạo shipment: {}. Cập nhật: {"status":"SHIPPED"}, sau đó {"status":"DELIVERED"} hoặc {"status":"FAILED"}. Không bỏ bước hoặc chuyển ngược. Gửi lại cùng trạng thái trả 200, giữ nguyên dữ liệu.

## 7. Kiểm thử tự động

Trên máy có Node.js 24, ở thư mục dự án:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd test
```

Database phải đang chạy và .env phải trỏ tới database bài tập. Test tạo dữ liệu ngẫu nhiên riêng và dọn lại dữ liệu của test; không chạy trên database production. Test từng nhóm: test:auth, test:products, test:orders, test:shipments.

Kiểm thử trong image Linux từ PowerShell:

```powershell
$taskTestsPath = (Join-Path (Get-Location).Path 'tests')
docker compose run --rm --no-deps --volume "${taskTestsPath}:/app/tests:ro" setup npm test
```

Đánh giá: 34 test pass, 0 fail. Nhóm test bao gồm token sai/hết hạn, phân quyền, giá lịch sử, rollback và cạnh tranh tồn kho/trạng thái shipment.

## 8. Xem log, dừng và cập nhật

```powershell
docker compose logs --tail 50 api setup
docker compose down
docker compose up -d --build --wait
```

down giữ named volume; không dùng tùy chọn xóa volume khi cần giữ dữ liệu. Khi sửa mã nguồn hoặc package, build lại image. Khi sửa .env, chạy lại Compose để container nhận cấu hình mới. Seed không đổi mật khẩu admin đã tồn tại.

Chạy API trực tiếp: docker compose stop api; docker compose up -d --wait db; npm.cmd ci; npm.cmd run db:generate; npm.cmd run dev. Giữ cửa sổ server mở. Trình duyệt GET hiển thị JSON, không phải giao diện cửa hàng. ERR_CONNECTION_REFUSED: kiểm tra docker compose ps -a và log; 401: thiếu/sai/hết hạn token; 403: sai quyền; 409: thiếu kho hoặc chuyển trạng thái không hợp lệ.

## 9. Đối chiếu sơ đồ và yêu cầu

Giữ 7 bảng Role, MemberShip, User, Product, Order, OrderDetail, Shipment; khóa ghép OrderDetail(oid,pid); một Order có nhiều Shipment. Dùng Decimal(10,2), username duy nhất, 6 khóa ngoại, 5 CHECK constraint trong migration. Không nhận quyền Admin từ đăng ký.

| Yêu cầu | Thành phần |
|---|---|
| .env | config.js, prisma.config.ts, Compose và script tạo cấu hình |
| JWT | auth/routes.js, auth/middleware.js |
| Docker Compose | Dockerfile, .dockerignore, db/setup/api |
| Health check | /health/live, /health/ready, pg_isready, healthcheck.js |

## 10. Giới hạn MVP và đánh giá khách quan

- API chạy cục bộ; chưa có frontend, thanh toán trực tuyến, refresh token, API logout/thu hồi token, hủy đơn hoặc hoàn tồn kho.
- FAILED là trạng thái giao thất bại, chưa tự hoàn kho. Shipment chưa ánh xạ từng dòng hàng, tracking number hoặc địa chỉ vì sơ đồ chưa có các trường này.
- MemberShip.score là ngưỡng hạng; chưa có điểm tích lũy riêng hoặc tự nâng hạng.
- Mỗi POST tạo đơn/shipments mới; chưa có idempotency key để chống gửi lặp request tạo.
- Rate limit dùng bộ nhớ một tiến trình, 20 request auth/IP/15 phút; chưa dùng kho chung cho nhiều instance.
- Tên sản phẩm trong đơn lấy tên hiện tại; unit_price lưu lịch sử theo sơ đồ.
- Đã khắc phục 4 mục high trong cây dependency Prisma bằng npm overrides: deepmerge-ts 8.0.2 và mysql2 3.24.5; giữ Prisma 7.10.0. npm audit hiện báo 0 vulnerabilities (08/10/2026). Xem BAO-CAO-BAO-MAT.md. Kiểm thử đạt và audit sạch không tự xác nhận ứng dụng sẵn sàng production.
- Database app đang dùng tài khoản do image PostgreSQL khởi tạo, có quyền cao cho migration; production cần tách quyền migration và runtime, TLS, quản lý secret và backup phù hợp.

## 11. Checklist bài nộp

Nộp mã nguồn, migration, tests, Dockerfile/Compose, .env.example, collection/environment mẫu, hướng dẫn và báo cáo kiểm tra. Không nộp .env thật, node_modules, token, mật khẩu hoặc dữ liệu cá nhân. Demo health, Customer bị chặn quyền Admin, đặt hàng và tồn kho, giá lịch sử, shipment; giải thích transaction và JWT. Kết quả kiểm tra phải đi kèm bằng chứng; không suy ra production-ready.

Nguồn tham khảo: [Prisma transactions v7](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [Prisma seed v7](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding), [Docker startup order](https://docs.docker.com/compose/how-tos/startup-order/), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken).

## 12. Demo theo phiếu chấm Prompt 2

Bản hiện tại tự gán role normal và membership BASIC score 10 khi đăng ký. Seed chuyển role CUSTOMER cũ sang normal và giữ liên kết tài khoản. Dùng HUONG-DAN-DEMO-PROMPT2.md và Prompt2-Demo.postman_collection.json cho buổi chấm: tạo X/Y qua CLI, đặt X x2 và Y x5, Admin tạo shipment, kiểm tra dữ liệu bằng Check-Prompt2.ps1. Kết quả thực tế trong BAO-CAO-DEMO-PROMPT2.md.
