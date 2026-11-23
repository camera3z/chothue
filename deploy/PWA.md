# Rentbook trên PC dưới dạng PWA

Website: **https://thue.filezuno.net**. PWA cài từ Chrome/Edge, có biểu tượng ứng dụng và mở trong cửa sổ riêng. Ứng dụng dùng cùng tài khoản, dữ liệu, phân quyền và bản quyền của Rentbook đang chạy.

## Cài trên Windows

1. Mở `https://thue.filezuno.net` trong Chrome hoặc Microsoft Edge cập nhật, ở cửa sổ thường.
2. Chọn **Cài Rentbook trên PC** ở thanh bên trái, ngay trên nhóm đổi giao diện/đăng xuất. Ở màn hình đăng nhập hoặc màn hình nhỏ, nút **Cài Rentbook** nằm ở đầu trang. Nếu Chrome/Edge đã cung cấp lời mời cài thì mở hộp cài ngay; nếu chưa, ứng dụng hiện hướng dẫn cài từ menu trình duyệt.
3. Xác nhận trong cửa sổ cài của trình duyệt. Mở Rentbook từ menu Start; có thể thêm lối tắt desktop/thanh tác vụ theo lựa chọn của trình duyệt.
4. Đăng nhập Filezuno hoặc email như trên web, kiểm tra đúng đơn vị và hạn bản quyền.

Trang công khai `?shop=...` dành cho khách đặt thuê không hiện nút cài ứng dụng quản trị. Nút cài tự ẩn trong cửa sổ PWA. Trong trình duyệt thường, nút luôn hiện dù chưa có `beforeinstallprompt`; việc người dùng đóng hộp cài không làm mất đường dẫn tới hướng dẫn.

### Khi PWA đã cài nhưng đang mở bằng tab web

Ngày 21/11 người dùng xác nhận PWA vẫn còn trong đúng hồ sơ đang mở tab.
Trình duyệt sẽ không gửi `beforeinstallprompt` để cài lại app đang có; bản
cũ chỉ kiểm tra display-mode của cửa sổ nên vẫn hiện hướng dẫn cài.

Manifest nay tự khai báo Rentbook trong `related_applications` với platform
`webapp`, URL manifest và id `https://thue.filezuno.net/`. Trong tab thường,
ứng dụng dùng `getInstalledRelatedApps()` để nhận diện chính PWA này khi
API hỗ trợ (desktop Chrome/Edge 140+). Có kết quả dương tính thì nút đổi
thành **Mở Rentbook**, hộp hướng dẫn hiện **Rentbook đã được cài** và liên
kết mở root trong cửa sổ mới. Không dùng localStorage làm bằng chứng cài;
API lỗi, không hỗ trợ hoặc trả rỗng không chứng minh PWA chưa được cài.

Nếu chưa có native prompt, nút trong hộp vẫn hiện trạng thái chưa sẵn sàng
và bị vô hiệu, có giải thích và hướng dẫn menu/Start; không tạo nút cài giả.
Khi native prompt đến, nút được bật. Có **Kiểm tra lại** và kiểm tra khi
trở lại cửa sổ. Kết quả kiểm tra đến muộn không ghi đè native prompt hoặc
sự kiện cài mới hơn. Không yêu cầu gỡ PWA, xóa phiên hoặc xóa dữ liệu.

Nhận diện cài đặt không có quyền ép mở cửa sổ PWA. Nếu người dùng chọn mở
link bằng browser hoặc dùng hồ sơ khác, cần mở từ Start hoặc bật mở liên
kết bằng Rentbook trong cài đặt ứng dụng. Giữ id/start_url/scope cũ để bản
PWA đã cài vẫn là cùng ứng dụng.

Nguồn: [kiểm tra PWA đã cài](https://developer.chrome.com/docs/capabilities/get-installed-related-apps),
[điều kiện hiện hộp cài](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).

## Mở hoặc cài từ danh sách Web App Filezuno

Nút **Mở ứng dụng** trên thẻ Rentbook ở danh sách Filezuno đi tới
`https://thue.filezuno.net/?install=1`, không qua trang chi tiết sản phẩm.

- Nếu Rentbook đã cài và trình duyệt cho phép ứng dụng xử lý liên kết đó,
  liên kết mở cửa sổ PWA. Trong chế độ standalone không hiện hướng dẫn cài lại.
- Nếu mở trong trình duyệt thường, Rentbook hiện ngay phần cài đặt, kể cả
  chưa đăng nhập. Có `beforeinstallprompt` thì hiện **Cài đặt ngay**; nếu
  chưa có thì hướng dẫn cài qua menu Chrome/Edge. Người dùng vẫn phải bấm
  xác nhận; lượt bấm ở domain Filezuno không thể thay cho xác nhận cài trên
  domain Rentbook. Không tự gọi native prompt khi event đến muộn.
- Chỉ xóa tham số `install=1` sau khi tiếp nhận, giữ các query khác và hash.
  Đóng hướng dẫn rồi tải lại không tiếp tục mời cài. Không áp dụng cho `?shop`.
- Nếu đã cài nhưng trình duyệt vẫn mở tab, kiểm tra tùy chọn mở liên kết
  được hỗ trợ trong cài đặt PWA hoặc mở từ Start. Website không thể ép
  trình duyệt khác/hồ sơ khác hoặc bỏ qua lựa chọn mở liên kết của người dùng.

Chrome 139+ hỗ trợ tự mở liên kết thuộc scope trong PWA theo tùy chọn người
dùng: [tài liệu Chrome](https://developer.chrome.com/docs/capabilities/pwa-navigation-management).
Hộp cài vẫn do trình duyệt kiểm soát: [tài liệu cài PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).

Khi triển khai tính năng này, phát hành Rentbook trước, sau đó Filezuno.
Không cần chạy SQL hoặc cấu hình lại provider/bản quyền/SePay.

## Mở nhiều lần dùng lại cửa sổ hiện có

Manifest dùng `launch_handler.client_mode: focus-existing`. Khi PWA đã mở,
Chrome/Edge có hỗ trợ sẽ đưa cửa sổ đó lên trước. Bấm lại **Mở ứng dụng**
từ Filezuno (`?install=1`) hoặc mở lại từ Start không tải lại màn hình,
không đóng biểu mẫu và không làm mất nội dung chưa lưu. Khi chưa có cửa
sổ ứng dụng, trình duyệt mở một cửa sổ mới như trước.

Consumer của `launchQueue` giữ nguyên thao tác khi chỉ mở root; vẫn chuyển
tới callback đăng nhập/khôi phục mật khẩu và liên kết `?shop=...` với đầy
đủ query/hash. Mở root khi đang xem storefront trở lại phần quản trị.
Lượt launch đầu không chạy lại callback mà cửa sổ mới đã tiếp nhận.
Chỉ tiếp nhận URL cùng origin; trình duyệt thiếu API vẫn dùng luồng cũ.

Quy tắc áp dụng cho PWA đã cài trong cùng hồ sơ trình duyệt và liên kết
được phép mở bằng ứng dụng. Không gom các tab web thông thường, hồ sơ hay
trình duyệt khác, và không áp dụng cho launcher `.exe` dùng `--app`.
Website không tự đóng các cửa sổ cũ đang có công việc chưa lưu.

Sau phát hành, lưu công việc rồi chọn **Có phiên bản mới** nếu nút xuất
hiện, đóng các cửa sổ Rentbook và mở lại. Trình duyệt cập nhật manifest
đã cài theo lịch riêng; cập nhật JS/service worker không chứng minh metadata
của PWA đã đổi ngay. Nếu còn mở nhiều cửa sổ, kiểm tra lại bằng bản PWA
trong đúng hồ sơ sau khi trình duyệt nhận manifest mới. Không cần xóa dữ liệu.

Nguồn: [launch handler](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler),
[navigation management](https://developer.chrome.com/docs/capabilities/pwa-navigation-management).

## Kết nối, dữ liệu và cập nhật

- **Đây là ứng dụng online.** Cần mạng để tải dữ liệu và lưu thay đổi. Khi đang mở mà mất mạng, có thông báo; khởi động khi offline chỉ hiện trang hướng dẫn kết nối lại.
- Service worker không tạo Cache Storage, không cache API, thông tin khách, hợp đồng, ảnh riêng, phiên hay license. Không có cơ chế ghi offline hoặc tự đồng bộ hàng đợi. Lưu trữ phiên Supabase và demo vốn có giữ nguyên.
- Điều hướng vào ứng dụng đi qua mạng; callback đăng nhập giữ nguyên query. Worker không can thiệp các request API, tài nguyên hoặc origin Supabase/Filezuno khác.
- Mỗi bản code/CSS build tạo release worker mới. Khi app còn mở, bản mới chờ và hiện **Có phiên bản mới**. Người dùng lưu công việc rồi chọn cập nhật và xác nhận tải lại. Không tự đóng biểu mẫu đang nhập. Tab/cửa sổ khác không bị ép reload.
- Lần mở sau lấy giao diện mới qua mạng. Đăng nhập/đăng xuất và kiểm tra bản quyền vẫn do ứng dụng/Supabase xử lý.
- Gỡ PWA bằng trình duyệt/Windows là gỡ ứng dụng trên thiết bị; dữ liệu và bản quyền trên máy chủ vẫn thuộc tài khoản.

## Cấu trúc mã

- `public/manifest.json`: tên, URL khởi động, scope, `standalone` và ưu tiên cửa sổ đang mở.
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

Browser test build production riêng với public config giả lập; Chromium kiểm tra manifest/installability thật, worker waiting/update, giữ bản nháp, offline fallback, API không cache, callback, storefront công khai và SSO PKCE. Kiểm tra `?install=1` ở trang đăng nhập, event đến muộn, giữ query/hash và bỏ hướng dẫn khi giả lập standalone. Thao tác nút cài dùng event giả lập. Người dùng đã xác nhận PWA và bộ cài PC chạy được ngày 21/11/2026; nút mở/cài mới từ Filezuno vẫn cần kiểm tra trên PC sau phát hành. Không dùng dữ liệu hay project thật trong các kiểm tra tự động.

Hồi quy mở nhiều lần cài riêng fixture localhost bằng CDP trong hồ sơ Chromium
tạm, mở cửa sổ standalone thật rồi lặp launch vào root, `?install=1` và
`/index.html`. Kiểm tra cùng target/document, không thêm cửa sổ, giữ view và
bản nháp; callback query/hash và chuyển storefront/quản trị vẫn hoạt động.
Gỡ fixture khi kết thúc. Đây là kiểm tra engine trên Linux, không thay thế
kiểm tra PWA đã cài trong Chrome/Edge trên Windows của người dùng. Thử liên
kết khác origin trong Chromium headless không kích hoạt capture; không coi
kết quả launch qua CDP là bằng chứng link capturing Windows.
