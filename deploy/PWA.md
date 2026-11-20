# Rentbook trên PC dưới dạng PWA

Website: **https://thue.filezuno.net**. PWA cài từ Chrome/Edge, có biểu tượng ứng dụng và mở trong cửa sổ riêng. Ứng dụng dùng cùng tài khoản, dữ liệu, phân quyền và bản quyền của Rentbook đang chạy.

## Cài trên Windows

1. Mở `https://thue.filezuno.net` trong Chrome hoặc Microsoft Edge cập nhật, ở cửa sổ thường.
2. Khi trình duyệt cho phép cài, chọn **Cài Rentbook** ở đầu trang. Cũng có thể chọn biểu tượng cài ứng dụng trên thanh địa chỉ hoặc mục cài ứng dụng trong menu trình duyệt.
3. Xác nhận trong cửa sổ cài của trình duyệt. Mở Rentbook từ menu Start; có thể thêm lối tắt desktop/thanh tác vụ theo lựa chọn của trình duyệt.
4. Đăng nhập Filezuno hoặc email như trên web, kiểm tra đúng đơn vị và hạn bản quyền.

Trang công khai `?shop=...` dành cho khách đặt thuê không hiện nút cài ứng dụng quản trị. Nút cài không hiện khi chạy trong cửa sổ PWA hoặc khi trình duyệt chưa cung cấp lời mời cài.

## Kết nối, dữ liệu và cập nhật

- **Đây là ứng dụng online.** Cần mạng để tải dữ liệu và lưu thay đổi. Khi đang mở mà mất mạng, có thông báo; khởi động khi offline chỉ hiện trang hướng dẫn kết nối lại.
- Service worker không tạo Cache Storage, không cache API, thông tin khách, hợp đồng, ảnh riêng, phiên hay license. Không có cơ chế ghi offline hoặc tự đồng bộ hàng đợi. Lưu trữ phiên Supabase và demo vốn có giữ nguyên.
- Điều hướng vào ứng dụng đi qua mạng; callback đăng nhập giữ nguyên query. Worker không can thiệp các request API, tài nguyên hoặc origin Supabase/Filezuno khác.
- Mỗi bản code/CSS build tạo release worker mới. Khi app còn mở, bản mới chờ và hiện **Có phiên bản mới**. Người dùng lưu công việc rồi chọn cập nhật và xác nhận tải lại. Không tự đóng biểu mẫu đang nhập. Tab/cửa sổ khác không bị ép reload.
- Lần mở sau lấy giao diện mới qua mạng. Đăng nhập/đăng xuất và kiểm tra bản quyền vẫn do ứng dụng/Supabase xử lý.
- Gỡ PWA bằng trình duyệt/Windows là gỡ ứng dụng trên thiết bị; dữ liệu và bản quyền trên máy chủ vẫn thuộc tài khoản.

## Cấu trúc mã

- `public/manifest.json`: tên, URL khởi động, scope và chế độ `standalone`.
- `public/icons/`: PNG 192/512, icon maskable 512 và Apple touch icon 180; biểu tượng theo thương hiệu Rentbook.
- `src/pwa.js`, `src/pwa.css`: nút cài/cập nhật và thông báo kết nối.
- `src/pwa-worker.js`: điều hướng network-only, offline fallback tĩnh.
- `vite.config.js`: phát hành `/sw.js` với mã release thay đổi theo bundle. Dev server không đăng ký worker.

Manifest/service worker đặt ở root của domain. Đăng ký dùng `updateViaCache: none`. Khi tự triển khai, phục vụ `sw.js` dưới MIME JavaScript, `manifest.json` dưới MIME JSON và tránh cache lâu hai tệp này. Vhost mẫu hiện có dùng `no-cache` cho các tệp ngoài `/assets/`; tài nguyên hash trong `/assets/` có thể cache lâu. Không áp dụng SPA fallback cho một worker bị thiếu.

## Phát hành trên VPS hiện có

Không cần tạo dự án Supabase, chạy SQL hoặc nhập khóa mới. Chạy từ checkout staging đã ghim commit:

```sh
python3 /DUONG-DAN-STAGING/code/deploy/deploy-sso.py \
  --source /opt/chothue --install-node-if-missing
```

Helper đọc URL/public key từ `.env.local` đang có, giữ SSO bật, tự xác định root Nginx riêng của `thue.filezuno.net`, kiểm tra bản web cũ, build riêng và sao lưu. Có thể dùng Node của NVM hiện có; nếu thiếu thì tải Node 24 chính thức, xác minh SHA-256 và đặt trong cache root riêng cho tiến trình build.

Sau phát hành, helper kiểm tra index, JS/CSS, manifest, service worker và các icon qua HTTPS Nginx. Sai manifest, icon thiếu/sai kích thước hoặc server trả HTML thay worker đều bị từ chối. Khi kiểm tra không đạt, helper khôi phục tệp cũ. Source `/opt/chothue`, `.env.local`, Nginx và dữ liệu Supabase giữ nguyên.

Backup frontend: `/root/rentbook-sso-release-*/previous-web`. Worker chỉ chuyển tiếp mạng nên rollback HTML/JS vẫn chạy được; không xóa browser storage hoặc identity để rollback. Nếu muốn ngừng PWA hoàn toàn, cần phát hành worker thay thế có chủ đích; không trả HTML ở `/sw.js` và không xóa session/dữ liệu người dùng.

## Kiểm tra

```sh
npm run test:pwa
PYTHONDONTWRITEBYTECODE=1 python3 tests/deploy-sso.py
```

Browser test build production riêng với public config giả lập; Chromium kiểm tra manifest/installability thật, worker waiting/update, giữ bản nháp, offline fallback, API không cache, callback, storefront công khai và SSO PKCE. Thao tác nút cài dùng event giả lập; test **không cài vào hệ điều hành**. Cần xác nhận một lần cài/mở từ Start và đăng nhập trên Windows thực tế sau phát hành. Không dùng dữ liệu hay project thật trong các kiểm tra tự động.
