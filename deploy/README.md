# Triển khai VPS

Ứng dụng là website tĩnh sau khi build. Supabase cung cấp Auth và database; không cần chạy Node.js hoặc PostgreSQL trên VPS.

## Chuẩn bị bản phát hành

Từ thư mục gốc dự án, cấu hình `.env.local` với URL và public key Supabase riêng, rồi chạy:

```sh
npm ci --cache /tmp/chothue-npm-cache
npm run build
mkdir -p /tmp/chothue-release
tar -czf /tmp/chothue-release/chothue-web.tar.gz -C dist .
sha256sum /tmp/chothue-release/chothue-web.tar.gz
```

Chỉ chuyển nội dung `dist` lên máy chủ. Không chuyển `.env.local`, source, thư mục Git hoặc service-role key. Public key đã được nhúng trong JavaScript theo thiết kế của Supabase; RLS là lớp phân quyền dữ liệu.

## Cài lên máy chủ

Trước khi thay đổi: kiểm tra OS, quyền SSH, dung lượng, website hiện tại, cổng 80/443, Nginx/Caddy/Apache/Docker đang chạy. Giữ nguyên cấu hình và dữ liệu website khác. Dùng thư mục phát hành và hostname riêng cho ứng dụng này.

Nếu máy chủ dùng Nginx, dùng `nginx.conf.template` làm vhost riêng: thay `RENTAL_DOMAIN` bằng domain đã trỏ DNS và `RELEASE_PATH` bằng thư mục bản build đã giải nén. Kiểm tra quyền đọc file của Nginx. Chạy `nginx -t` thành công trước khi reload; không thay toàn bộ cấu hình Nginx. Giữ cấu hình và đường dẫn bản phát hành cũ để rollback.

Cài TLS bằng công cụ ACME phù hợp cấu hình VPS sau khi xác nhận DNS; bật chuyển hướng HTTP sang HTTPS sau khi có chứng chỉ hợp lệ. Không chạy Vite dev/preview làm dịch vụ production.

## Supabase Auth

Trong Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://TEN-MIEN-THAT`.
- Redirect URLs: cho phép URL HTTPS chính xác của ứng dụng.

Nếu dùng email mặc định của Supabase, kiểm tra giới hạn gửi thư; cấu hình SMTP riêng khi mở bán. Không tắt xác nhận email để vượt lỗi cấu hình.

## Kiểm tra sau triển khai

- HTTPS có chứng chỉ hợp lệ và trả về giao diện ứng dụng.
- Đường dẫn `/assets/` hoạt động; file không tồn tại trong `/assets/` trả 404.
- Đăng ký bằng email kiểm thử thuộc quyền sở hữu của người dùng; xác nhận email quay về đúng domain, đăng nhập thành công.
- Workspace mới được tạo, key hợp lệ kích hoạt được, key sai/đã dùng bị từ chối.
- Kiểm tra tạo tài sản, khách thuê, hợp đồng, thu tiền và nhận trả.
- Dùng hai tài khoản để kiểm tra cách ly dữ liệu; không dùng tài khoản thực của khách hàng để kiểm thử.

Đây là MVP. Xem giới hạn đồng thời và rate limiting trong README gốc trước khi mở bán công khai.
