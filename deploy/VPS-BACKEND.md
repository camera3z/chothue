# Rentbook dùng tài khoản Filezuno và PostgreSQL VPS

Ngày 28/11/2026: có bản code/kiểm thử, **chưa đổi website production**.
Mục tiêu đã chốt: chuyển toàn bộ tài khoản/quyền/dữ liệu, Rentbook làm app
thử trước, sau đó áp dụng cùng tài khoản Filezuno cho web-app khác.

Cập nhật cùng ngày: người dùng đã chọn **bắt đầu Rentbook với dữ liệu mới,
giữ nguyên Supabase cũ**. Dùng helper của Hub
`deploy/start-rentbook-vps.py --rentbook-checkout CHECKOUT --start-empty` từ
staging đã pin. Helper sao lưu/thử phục hồi, bật API/Nginx, gọi deploy frontend
bên dưới và cài backup đêm. Không cần URI hoặc quyền IPv4 trên Supabase.
Tài khoản Filezuno hiện có giữ nguyên; dữ liệu và gói/key cũ không tự chuyển.
Lần đăng nhập đầu tạo đơn vị trống; cơ chế bản quyền vẫn áp dụng như trước.

Frontend có `VITE_FILEZUNO_BACKEND=vps`, dùng `src/vps-client.js` gọi API
cùng origin `/api/rentbook/`. Đăng nhập qua `/_app-session/start`, cookie
Filezuno host-only; đăng ký/đặt lại mật khẩu ở Filezuno. Không dùng token
Supabase trong mode này. Mode demo/legacy mặc định giữ nguyên.

Thêm mục **Thành viên**, bốn vai trò Chủ đơn vị/Quản trị/Nhân viên/Chỉ xem,
và chọn đơn vị khi tham gia nhiều nơi. Quyền được quyết định lại ở backend,
không dựa vào metadata trình duyệt. Không cấp quyền chủ đơn vị cho quản trị
thông thường. Cập nhật thành viên tải lại quyền đang dùng. Lỗi kết nối lúc
trở về tab giữ biểu mẫu đã mở.

Backend, PostgreSQL schema, ánh xạ UUID cũ, key binding và công cụ
snapshot/import/backup nằm trong repo Filezuno `camera3z/filezuno-web`,
nhánh `r2-private-storage`, tài liệu **docs/NATIVE-APPS.md**.

Sau khi migration dữ liệu đã hoàn tất và API khỏe qua Nginx HTTPS mới chạy:

```sh
python3 deploy/deploy-sso.py --source /opt/chothue --install-node-if-missing --backend-vps
```

Cờ mới không tự chuyển dữ liệu hoặc sửa Nginx; health PostgreSQL chưa đúng
thì không phát hành bundle VPS. Source và `.env.local` đã cài được giữ lại.
Không dùng cờ này chỉ để thử giao diện trên website thật khi chưa có dữ liệu
và ánh xạ tài khoản. Sau cutover vẫn cần kiểm tra bằng tài khoản/ảnh/key thật.

Kiểm tra local: `VITE_FILEZUNO_BACKEND=vps npm run build`, sau đó browser
integration `tests/browser-rentbook-vps.cjs` từ repo Filezuno. Browser fixture
dùng database PostgreSQL riêng, không gọi Supabase thật hoặc dịch vụ tính phí.
