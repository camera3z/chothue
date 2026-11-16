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
