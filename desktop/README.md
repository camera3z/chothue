# Rentbook Desktop cho Windows

Bộ cài `RentbookSetup.exe` tạo biểu tượng **Rentbook Desktop** ở Desktop và
Start, cùng mục gỡ cài đặt trong Windows Settings. Mở biểu tượng để vào
Rentbook trong cửa sổ riêng, không cần gõ URL.

## Cách hoạt động

- Windows 10/11, có Google Chrome hoặc Microsoft Edge, cần Internet.
- Launcher ưu tiên Chrome, sau đó Edge, với địa chỉ cố định
  `https://thue.filezuno.net/` qua chế độ `--app`. Dùng hồ sơ mặc định của
  trình duyệt; nếu tài khoản trước đó nằm trong hồ sơ khác, đăng nhập lại
  bằng cùng tài khoản để truy cập cửa hàng và bản quyền cũ.
- Đây là launcher dùng trình duyệt hiện có. Bộ cài không đăng ký ứng dụng
  PWA trong trình duyệt, không kèm WebView2/Chromium riêng và không hỗ trợ
  thao tác dữ liệu khi offline. PWA cài trực tiếp vẫn dùng được song song.
- Cài cho tài khoản Windows hiện tại ở
  `%LOCALAPPDATA%\Programs\Filezuno\Rentbook`, không yêu cầu quyền admin.
  Shortcut dùng tên `Rentbook Desktop`, không ghi đè shortcut PWA `Rentbook`.
- Chỉ launcher, icon và hướng dẫn nằm trong bộ cài. Không chứa mã nguồn web,
  biến môi trường, API key, key bản quyền hoặc dữ liệu cửa hàng.
- Gỡ cài đặt chỉ xóa các file, shortcut và mục HKCU do bộ cài tạo. Không xóa
  dữ liệu máy chủ, hồ sơ trình duyệt hoặc phiên đăng nhập.
- Nội dung web cập nhật từ máy chủ; không cần build lại bộ cài khi chỉ đổi
  chức năng/giao diện web. Bản cập nhật PWA vẫn đợi người dùng xác nhận.

## Bản tải về

[Bản thử 1.0.0](releases/1.0.0/README.md) có một file `.exe`, checksum SHA-256
và metadata. Bản thử **chưa có chữ ký số Authenticode**; Windows có thể báo
nhà phát hành chưa xác định. Không hướng dẫn tắt SmartScreen/Defender.

Đã biên dịch và kiểm tra cấu trúc PE, quyền thực thi, nội dung gói và chế độ
cửa sổ Chromium trên Linux. **Chưa chạy cài/gỡ trên Windows thật.** Chưa đưa
nút tải bản này lên trang bán hàng cho khách.

## Build

Cần Python 3 và NSIS 3.11 trở lên. Công cụ build dùng thư viện chuẩn Python,
chạy được trên Windows hoặc Linux, không sửa cấu hình hệ thống:

```sh
python desktop/build_windows.py --version 1.0.0 --makensis /path/to/makensis
```

Windows có thể dùng `py` và đường dẫn `makensis.exe`. Nếu NSIS đã ở PATH thì
bỏ `--makensis`. Bản NSIS được giải nén riêng trên Linux cần đặt `NSISDIR`
trỏ tới thư mục chứa các include/plugin của chính bộ công cụ đó.

Đầu ra mặc định `desktop/build/` (Git bỏ qua): launcher, bộ cài,
`release.json`, `SHA256SUMS.txt`. Metadata ghi trạng thái chữ ký thực tế,
hash file và fingerprint của các nguồn được đóng gói. Không tự tuyên bố
chữ ký đã được Windows xác thực.

Icon đã có trong Git. Khi đổi logo, tạo lại từ `public/favicon.svg` bằng
`CHROMIUM_PATH=/usr/bin/chromium node desktop/build-icon.mjs` sau `npm ci`.

## Kiểm tra

Sau build, có 7-Zip và các dev dependency của repo:

```sh
SEVEN_ZIP=/path/to/7z python tests/desktop-installer.py
CHROMIUM_PATH=/usr/bin/chromium node tests/desktop-window.mjs
```

Bài kiểm tra bộ cài giải nén thật, đối chiếu byte/hash launcher/icon/hướng
dẫn, kiểm tra manifest Windows `asInvoker`, đường dẫn và phạm vi gỡ cài đặt.
Bài Chromium dùng server thử riêng, xác nhận `display-mode: standalone` và
giữ query callback. Không gọi API sản xuất hoặc đăng nhập tài khoản thật.

Trước khi phân phối cho khách, kiểm tra trên Windows 10/11: cài bằng user
thường, shortcut Desktop/Start, Chrome/Edge, đăng nhập đúng cửa hàng, lưu
và mở lại, gỡ ứng dụng rồi mở web để xác nhận dữ liệu còn nguyên. Cần ký
Authenticode với chứng thư của nhà phát hành và xác minh chữ ký trên file
cuối trước khi công bố bản chính thức. Ký số làm đổi checksum: tạo lại
metadata/checksum cho chính file sẽ phân phối.
