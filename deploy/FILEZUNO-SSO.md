# Rentbook: đăng nhập dùng chung với Filezuno

Dự án: https://lkwnbvervvgbbvfosohi.supabase.co
Website: https://thue.filezuno.net

1. Cập nhật Filezuno với module `sso.py` và cấu hình confidential client `rentbook`
   trong `/etc/filezuno.env`. Callback lấy chính xác từ form custom provider:
   `https://lkwnbvervvgbbvfosohi.supabase.co/auth/v1/callback`.
2. Dashboard Supabase → Authentication → Providers → New Provider → Manual
   configuration. Identifier `custom:filezuno`, client ID `rentbook`, client secret
   khớp Filezuno. PKCE bật. Scopes `email`, `profile`.
   Authorization URL `https://filezuno.net/oauth/authorize`;
   Token URL `https://filezuno.net/oauth/token`;
   UserInfo URL `https://filezuno.net/oauth/userinfo`.
3. Site URL `https://thue.filezuno.net`. Cho phép redirect chính xác
   `https://thue.filezuno.net/`. Không dùng wildcard.
4. Giữ `.env.local` hiện tại, thêm `VITE_FILEZUNO_SSO=1`. Không đưa client secret
   vào các biến `VITE_`. Build bằng `npm ci && npm run build`, phát hành `dist` theo
   hướng dẫn VPS hiện có. Không chạy lại schema SQL, không thay RLS.

Đăng nhập Filezuno yêu cầu email đã xác minh và sự đồng ý chia sẻ mã tài khoản,
tên và email. Mật khẩu không chuyển sang Rentbook. Supabase vẫn tạo phiên và giữ
phân quyền hiện có. License không tự cấp sau đăng nhập.

Email/password cũ vẫn hoạt động. Supabase hỗ trợ liên kết identity cùng email đã
xác minh: trước khi mở rộng, kiểm tra tài khoản thử cũ giữ nguyên UUID, shop,
dữ liệu và license. Email khác nhau chưa có luồng gộp; không tự đổi chủ dữ liệu.
Phiên Supabase có vòng đời riêng, chưa có đăng xuất toàn hệ thống tức thời.

Rollback UI: bỏ `VITE_FILEZUNO_SSO`, build và phát hành lại bản trước. Không xóa
các identity hoặc dữ liệu của khách để rollback. Kiểm tra thật với hai tài khoản
và hai shop sau khi provider được bật; build/test mock không thay thế bước đó.

## Phát hành tự động từ checkout staging

Khi mã nguồn/cấu hình cũ ở `/opt/chothue`, có thể chạy từ checkout mới:

```sh
python3 deploy/deploy-sso.py --source /opt/chothue
```

Công cụ yêu cầu root, Node.js 22+, npm, Nginx và curl. Nó dùng public config hiện
có, tự tìm Node trong PATH hoặc NVM, build riêng với SSO bật, xác định đúng root
của `thue.filezuno.net` bằng cấu hình Nginx và kiểm tra HTTPS nội bộ với chứng chỉ
hợp lệ trước khi ghi. Không đổi cấu hình Nginx, các website khác hoặc Supabase.
Nếu root dùng chung với hostname khác, không rõ ràng hoặc có symlink bên trong,
công cụ dừng trước khi phát hành.

Bản giao diện cũ được sao lưu trong `/root/rentbook-sso-release-*/previous-web`.
Assets được ghi trước, `index.html` sau cùng; asset hash cũ được giữ để các tab
đang mở vẫn tải được. Nếu kiểm tra tệp mới qua Nginx không đạt, khôi phục tệp cũ.
Thông báo thành công chưa xác nhận người dùng đã đăng nhập SSO thật; cần bấm nút,
đồng ý kết nối và kiểm tra shop/license sau khi quay về Rentbook.

Source `/opt/chothue` và `.env.local` cũ được giữ nguyên. Những lần cập nhật sau
cần tiếp tục dùng helper hoặc bảo đảm `VITE_FILEZUNO_SSO=1` trong môi trường build.
Không cần restart Nginx cho cập nhật tệp tĩnh này. Kiểm thử helper:
`python3 tests/deploy-sso.py`.
