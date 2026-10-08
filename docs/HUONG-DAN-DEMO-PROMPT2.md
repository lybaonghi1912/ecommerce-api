# Demo Prompt 2 theo phiếu chấm

Thực hành 2 có 8 mục, mỗi mục tối đa 1 điểm. Tài liệu này giúp thao tác trực tiếp và giải thích; kết quả chạy tự động không thay thế phần trình bày của sinh viên. Thực hiện trong PowerShell tại C:\Users\lybao\Documents\ecommerce-api, hoặc thư mục giải nén chứa compose.yaml.

## Bước 1 - Giải thích Monolithic

Mở src/app.js và cây thư mục src. Một ứng dụng Express gắn các router auth, products, orders, shipments; src/server.js khởi động một tiến trình API. Các module dùng chung Prisma Client và một PostgreSQL database. Không triển khai các chức năng thành những dịch vụ độc lập. Container database và container setup không làm ứng dụng thành microservices: setup chỉ chạy migration/seed rồi kết thúc.

- src/auth: đăng ký, đăng nhập JWT, kiểm tra tài khoản/quyền.
- src/products: xem và quản lý sản phẩm.
- src/orders: tạo/xem đơn, transaction cập nhật tồn kho.
- src/shipments: tạo shipment và cập nhật trạng thái.
- prisma: schema, migration SQL, seed.
- tests: kiểm thử tích hợp với HTTP và database thật.

Đánh giá: nhận diện được một ứng dụng API, các module cùng triển khai và database chung.

## Bước 2 - Giải thích .gitignore và .env trên GitHub

Mở .gitignore và .env.example. .env chứa thông tin cấu hình riêng: URL database, JWT secret, mật khẩu DB và admin. dotenv đọc cấu hình khi chạy trên máy; Docker Compose đọc .env và truyền biến môi trường vào container. src/config.js kiểm tra cấu hình trước khi phục vụ request. .env.example chỉ chứa mẫu; .dockerignore ngăn đưa .env thật vào image.

```powershell
git status --short
git check-ignore .env .demo/Prompt2-Local.postman_environment.json node_modules/
git ls-files .env .env.example
```

Đánh giá: .env, .demo và node_modules bị ignore; chỉ .env.example được theo dõi. .gitignore không tự xóa secret đã commit trước đó. Không mở .env thật trên màn hình quay/chia sẻ; trình bày bằng .env.example.

Repository công khai: [https://github.com/lybaonghi1912/ecommerce-api](https://github.com/lybaonghi1912/ecommerce-api). Đã đẩy mã nguồn lên nhánh main. Tại GitHub, mở .gitignore và .env.example, chỉ ra không có .env thật. Mã nguồn, migration, tests và bộ demo đều có trong repository.

## Bước 3 - Giải thích Prisma ORM

Mở prisma/schema.prisma: 7 model nghiệp vụ, các khóa ngoại và khóa ghép @@id([oid,pid]) của OrderDetail. Membership ánh xạ thành bảng MemberShip. Giá dùng Decimal(10,2); createat mặc định now() từ database. Migration SQL chứa các ràng buộc CHECK.

Mở src/prisma.js: adapter PostgreSQL và Prisma Client. src/auth/routes.js dùng prisma.user.create/findUnique; src/orders/service.js dùng transaction Serializable, kiểm tra tồn kho trước khi trừ và lấy đơn giá từ database. Khi một dòng không đủ hàng, transaction rollback; khi có xung đột, thử lại tối đa 3 lần.

```powershell
docker compose run --rm --no-deps setup npx prisma validate
docker compose run --rm --no-deps setup npx prisma migrate status
```

Đánh giá: schema valid, database up to date. setup chạy migrate deploy, không dùng migrate dev trong container triển khai.

## Bước 4 - Compose, health check, liệt kê container

```powershell
docker compose up -d --build --wait
docker compose ps -a
curl.exe --noproxy "*" -i http://localhost:3000/health/live
curl.exe --noproxy "*" -i http://localhost:3000/health/ready
```

Đánh giá: db và api healthy; setup Exited (0). Live trả 200 khi tiến trình còn hoạt động; ready trả 200 khi truy vấn SELECT 1 thành công, 503 khi database không truy cập được. Nếu đã đổi PORT thì thay cổng trong URL và truyền -Port ở bước 5.

## Bước 5 - Vào PostgreSQL, kiểm tra bảng và tạo X/Y bằng CLI

```powershell
docker compose exec db sh
```

Trong shell container:

```sh
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Trong psql:

```sql
\dt
\d "OrderDetail"
\q
```

Gõ exit để về PowerShell. Tạo hai sản phẩm qua psql trong container:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Prepare-Prompt2.ps1
```

Script thực hiện INSERT trực tiếp qua PostgreSQL CLI, tạo X: giá 100000.00, tồn 10; Y: giá 200000.00, tồn 20. Hiển thị pid và tạo environment Postman trong .demo/Prompt2-Local.postman_environment.json. Không giả định pid luôn bằng 1 hoặc 2. Mỗi lần chạy tạo cặp mới, giữ sản phẩm đã có. Đừng chạy lại giữa một lượt demo.

Đánh giá: có 7 bảng nghiệp vụ và bảng _prisma_migrations; OrderDetail có khóa ghép oid/pid; CLI hiển thị hai pid cùng tồn kho 10/20.

## Bước 6 - Postman đăng ký normal/10, đăng nhập, hiện token

Import docs/Prompt2-Demo.postman_collection.json và environment từ .demo vừa tạo. Chọn environment đó. Điền admin_username/admin_password trên máy cá nhân; collection xuất không lưu secret. Request 01 tạo username/password demo mới trong collection variables. Chạy tuần tự 01 đến 06.

- 01/02: health 200.
- 03/04: X/Y có tồn kho ban đầu 10/20.
- 05: đăng ký, HTTP 201, user.role.rolename="normal", user.membership.score=10; không trả password.
- 06: đăng nhập, HTTP 200; accessToken xuất hiện trong response và được lưu vào customer_token để các request sau dùng Bearer Token.

Đánh giá: đúng normal và score 10 cả khi register/login. Chỉ hiển thị token demo khi thầy yêu cầu; không lưu token vào GitHub hoặc file nộp.

## Bước 7 - Đặt hàng X x2, Y x5 rồi chuyển sang shipment

Chạy tuần tự 07 đến 14 trong Postman:

- 07: cùng body đặt hàng, không token, phải trả 401.
- 08: có token của tài khoản vừa đăng ký, đặt X qty=2 và Y qty=5, HTTP 201; ghi lại oid. Tổng 1200000.00, có hai items, createat là thời gian hiện hành của server/database.
- 09: xem đơn và hai dòng chi tiết bằng token chủ đơn.
- 10/11: tồn kho X=8, Y=15.
- 12: Admin đăng nhập để xử lý giao hàng.
- 13: Admin tạo shipment cho oid vừa đặt, HTTP 201, status=PENDING.
- 14: Customer xem lại đơn, hiển thị shipments gồm bản ghi vừa tạo.

Shipment được Admin tạo ở thao tác 13 sau khi đặt hàng thành công; POST tạo đơn chưa tự sinh shipment. Phiếu chấm mô tả luồng chuyển sang shipment và chưa ghi rõ tự động. Demo này trình bày hai thao tác liên tiếp, giữ đúng quyền Admin quản lý giao hàng. Nếu giảng viên yêu cầu tự tạo shipment ngay trong POST order, cần sửa nghiệp vụ và kiểm thử theo yêu cầu đó.

Đánh giá: toàn bộ 14 request có Tests đạt; không token bị chặn; đơn đúng số lượng, thời gian, tiền, tồn kho và shipment. Không chạy lại request 08 trên cùng cặp X/Y nếu muốn so sánh đúng tồn kho 8/15. Chuẩn bị cặp mới bằng bước 5 và chạy một lượt mới.

## Bước 8 - Kiểm chứng dữ liệu bằng CLI

Thay các ID bên dưới bằng oid ở request 08 và hai pid từ bước 5:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Check-Prompt2.ps1 -OrderId <oid> -ProductX <pid_X> -ProductY <pid_Y>
```

Các dấu <...> là chỗ cần thay, không copy nguyên lệnh mẫu này. Lệnh với ID thật của lượt đã chạy có trong BAO-CAO-DEMO-PROMPT2.md.

Script dùng psql trong container và hiển thị Role/MemberShip/User, Order, OrderDetail, Product, Shipment. Kiểm tra cuối có prompt2_demo_pass=t và PASS; nếu dữ liệu không khớp, script thoát với lỗi.

Đánh giá: normal/10, Order đúng chủ tài khoản, hai dòng qty 2/5, đơn giá 100000/200000, tồn kho 8/15 và Shipment PENDING đúng oid.

## Kết quả chuẩn bị

Đã chạy lại 34 kiểm thử tích hợp với backend mới. Collection Prompt 2 có 14 request và 26 assertion; kết quả thực tế và ID dữ liệu ở BAO-CAO-DEMO-PROMPT2.md. Dữ liệu của lượt này được giữ lại để xem qua CLI. Gói mã nguồn không kèm .env, .demo, node_modules hoặc secret thực. Mã nguồn đã được đẩy lên repository công khai [https://github.com/lybaonghi1912/ecommerce-api](https://github.com/lybaonghi1912/ecommerce-api). Việc giải thích trực tiếp và điểm số cuối cùng thuộc buổi chấm của giảng viên.
