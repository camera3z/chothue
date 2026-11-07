# thuê — Quản lý cho thuê đa ngành

Ứng dụng độc lập, không dùng dữ liệu hoặc cấu hình của QRMenu. Quản lý tài sản theo danh mục tự đặt, khách thuê, hợp đồng, nhận trả và thu tiền. Một tài khoản đại diện một đơn vị; một key dùng một lần để kích hoạt hoặc gia hạn đơn vị đó.

## Chạy demo

Node.js 22+ và npm. Trong `/workspace/chothue`:

```sh
npm ci
npm run dev
```

Khi chưa cấu hình Supabase, dữ liệu mẫu lưu trong localStorage của trình duyệt. Demo không xác thực key, không dùng cho dữ liệu thật. Xóa mục `chothue-demo-v1` trong localStorage để khởi tạo lại dữ liệu mẫu.

## Supabase riêng

1. Tạo dự án Supabase mới, riêng biệt với QRMenu.
2. Chạy `supabase/schema.sql` một lần trong SQL editor của dự án mới.
3. Sao chép `.env.example` thành `.env.local`, điền URL dự án và publishable/anon key của dự án đó. Không dùng service-role key ở frontend.
4. Trong Supabase Authentication, cấu hình Site URL và redirect URL theo địa chỉ triển khai, bật Email/Password và cấu hình email xác nhận phù hợp.
5. Khởi động lại Vite. Đăng ký, xác nhận email và đăng nhập. Workspace được tạo tự động; dữ liệu trống, tách biệt với demo.
6. Quản trị viên chạy `supabase/issue-key.sql` trong SQL editor và giao key trả về cho người mua qua kênh an toàn. Mặc định 365 ngày; thay thời hạn trong SQL nếu cần. Người mua nhập key ở **Gói & bản quyền**. Key được lưu dạng hash, kiểm tra và tiêu thụ trong transaction trên máy chủ. RLS chặn ghi khi chưa có bản quyền hoặc đã hết hạn, vẫn cho phép đọc dữ liệu.

Không đưa key bán cho khách, mật khẩu hoặc service-role key vào Git. `.env.local` được bỏ qua bởi Git. Cấu hình các biến `VITE_` được công khai trong bản build nên chỉ dùng URL và anon/publishable key.

## Kiểm tra và build

```sh
npm run build
npm run preview
```

Kiểm tra thủ công: tạo tài sản và khách thuê; lập hợp đồng; xác nhận số khả dụng giảm; ghi nhận thu tiền; nhận trả để số khả dụng tăng. Thử số lượng vượt tồn, ngày trả trước ngày thuê, tiền thu vượt tổng để xác nhận bị từ chối. Với Supabase: cần hai tài khoản để kiểm tra không đọc/ghi chéo workspace; kiểm tra key không hợp lệ, key đã dùng và key hết hạn. Các bước Supabase cần dự án thật; build/demo không chứng minh chúng đã chạy thành công.

## Phạm vi bản đầu

Tồn kho được giữ trong toàn bộ thời gian hợp đồng đang thuê, chưa có đặt lịch theo khung giờ. Giá được chốt theo số đơn vị tính tiền nhập thủ công, không tự suy ra từ ngày. Thanh toán được ghi nhận thủ công, chưa tích hợp bán key tự động, hóa đơn, cổng thanh toán hoặc giao nhận. Chưa có ảnh, mã tài sản riêng lẻ, phí trễ hạn hoặc khấu hao.

Dữ liệu MVP lưu một JSON document cho mỗi workspace. Hai phiên ghi đồng thời có thể ghi đè nhau; cần tách bảng giao dịch, cập nhật tồn kho bằng transaction và thêm nhật ký thanh toán trước khi vận hành nhiều nhân viên. Người mua có thể sửa dữ liệu workspace của mình qua API nhưng không thể tự cấp bản quyền hoặc truy cập workspace khác. Cần bổ sung rate limiting cho RPC kích hoạt key trước khi mở bán công khai.

## RENTOS — bàn điều hành cho thuê

Bản giao diện mới dùng tên RENTOS, tông xanh đậm/cam và màn hình đăng nhập hai cột. Bàn điều hành theo dõi tài sản đang thuê, lịch hẹn trả trong ngày, hợp đồng quá hạn, công nợ và kho khả dụng. Lịch giao–trả hiển thị từng ngày trong tuần; danh sách hợp đồng lọc theo đang thuê/quá hạn/đã trả.

Tiền cọc tách riêng tiền thuê: nhập cọc khi tạo hợp đồng, hoàn một phần hoặc toàn bộ khi nhận trả, và hoàn phần còn lại trong Công nợ & tiền cọc. Chi tiết hợp đồng lưu ghi chú giao/nhận và nhật ký các lần thu/hoàn từ phiên bản này. Hợp đồng cũ vẫn đọc được; không tự tạo nhật ký giả cho các khoản thu cũ. Tài sản bảo trì bị trừ khỏi tồn khả dụng; cập nhật số lượng bảo trì về 0 khi hoàn tất. Dữ liệu bổ sung dùng các trường JSON tùy chọn trong records, không cần chạy lại schema SQL hay xóa dữ liệu.

Lịch thể hiện ngày giao/hẹn trả theo hợp đồng; không phải hệ thống đặt chỗ tương lai. Chưa hỗ trợ hợp đồng nhiều dòng tài sản, trả từng phần, tự động tính phí trễ/hư hỏng, khấu trừ cọc hoặc giao dịch tồn kho đồng thời. Không tự quy đổi tổng đơn vị giữa các ngành; người dùng cần đặt danh mục và đơn vị tính phù hợp.

### Kiểm thử nghiệp vụ bằng trình duyệt

Dùng một terminal chạy server demo riêng, ghi đè biến Supabase để tránh chạm dữ liệu thật:

```sh
VITE_SUPABASE_URL='' VITE_SUPABASE_ANON_KEY='' npm run dev -- --port 5174
```

Terminal khác chạy:

```sh
npx playwright install chromium
npm run test:smoke
```

Nếu Chromium hệ thống đã có sẵn: `CHROMIUM_PATH=/usr/bin/chromium npm run test:smoke`. Bài kiểm thử dùng browser context mới, kiểm tra cọc/hoàn cọc, thanh toán, bảo trì, lịch, quá hạn, dữ liệu cũ và kích thước màn hình di động. Ảnh chụp được lưu trong test-results (bỏ qua bởi Git).
