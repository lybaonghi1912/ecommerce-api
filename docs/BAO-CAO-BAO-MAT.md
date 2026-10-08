# Báo cáo khắc phục dependency

Ngày kiểm tra: 08/10/2026. Dự án: E-commerce RESTful API MVP.

## Kết quả

`npm audit --json` sau cập nhật báo **0 vulnerabilities**: info=0, low=0, moderate=0, high=0, critical=0. Trước cập nhật có 4 mục high trong cây dependency Prisma. Đây là các mục thư viện bị ảnh hưởng và dependency cha, không phải 4 lỗi độc lập trong mã API.

## Thay đổi

Giữ Prisma, Prisma Client và adapter PostgreSQL ở 7.10.0. Thêm overrides có phạm vi trong package.json, cập nhật package-lock.json:

```json
"overrides": {
  "@prisma/config": {
    "deepmerge-ts": "8.0.2"
  },
  "prisma": {
    "mysql2": "3.24.5"
  }
}
```

| Dependency gián tiếp | Trước | Sau | Vị trí |
|---|---|---|---|
| deepmerge-ts | 7.1.5 | 8.0.2 | @prisma/config |
| mysql2 | 3.15.3 | 3.24.5 | prisma |

Ứng dụng dùng PostgreSQL; mysql2 nằm trong dependency của Prisma CLI. npm overrides buộc npm chọn các bản đã vá thay cho bản Prisma đang khai báo. Không dùng npm audit fix --force để đổi sang Prisma 6. Không thay đổi schema hoặc xóa database/volume.

Các cảnh báo đối chiếu: [deepmerge-ts recursive graph](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [mysql2 authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), [mysql2 decompression](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3).

## Kiểm tra sau thay đổi

| Kiểm tra | Kết quả |
|---|---|
| npm audit --json | 0 vulnerabilities |
| npm ls deepmerge-ts mysql2 | Đúng 8.0.2 và 3.24.5, overridden |
| prisma validate | Schema hợp lệ |
| prisma generate trên Windows và trong build Linux | Prisma Client 7.10.0 tạo thành công |
| prisma migrate status | 1 migration; database schema up to date |
| Docker build với npm ci | Thành công; audit trong build cũng báo 0 |
| Compose setup: migrate deploy và seed | Exit 0 |
| Kiểm thử tích hợp trên image mới | 34/34 đạt, 0 lỗi |
| Collection trên API Docker và PostgreSQL thật | 20 request, 30 assertion, 0 lỗi |
| Health readiness | HTTP 200, database up |
| Compose | API và DB healthy |
| Dữ liệu kiểm thử collection | Đã dọn; số lượng dữ liệu có trước được giữ nguyên |

Các test bao gồm JWT/phân quyền, giá lịch sử, rollback tồn kho, mua đồng thời sản phẩm cuối và cập nhật shipment đồng thời. Gói ZIP được tạo lại với package-lock mới; không chứa .env thật, node_modules hoặc secret thực.

## Duy trì

Khi cập nhật Prisma, kiểm tra dependency của bản mới và chạy lại audit, generate, migration và tests. Chỉ bỏ overrides khi bản Prisma mới tự dùng dependency đã vá và các kiểm tra vẫn đạt. Chưa xác nhận tương thích với mọi tính năng Prisma ngoài phạm vi MVP đã kiểm thử.

Audit sạch phản ánh các cảnh báo đã biết trong cây npm dependency tại thời điểm kiểm tra; không thay thế kiểm tra toàn bộ bảo mật hoặc quét image Docker. Các giới hạn MVP trong hướng dẫn vẫn áp dụng.
