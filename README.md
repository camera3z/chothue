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

## Giao diện Rentbook

Giao diện hiện tại dựa trên mẫu `rentbook_1.html` người dùng cung cấp: bảng màu xanh ngọc, bố cục sáng gọn, menu trái trên desktop và điều hướng dưới trên mobile. Có chế độ sáng/tối (ghi nhớ trong trình duyệt), danh sách đơn thuê dạng hàng, tài sản dạng thẻ với bộ lọc danh mục, lịch thanh theo từng tài sản trong 14 ngày và tổng quan thu tiền sáu tháng. Biểu đồ chỉ lấy giao dịch `rent` có ngày trong `transactions`; không coi tiền cọc là doanh thu và không tự suy diễn ngày thu của dữ liệu cũ.

Chỉ áp dụng giao diện và các thao tác tương thích với mô hình dữ liệu hiện tại. Không nhập dữ liệu mẫu, mã JavaScript demo hoặc cơ chế workspace local của file mẫu vào Supabase. Các khả năng nâng cao trong mẫu như đặt chỗ tương lai theo giờ, trường động theo loại hình và hủy đơn chưa được triển khai. Chế độ Supabase và cấp key giữ nguyên, không cần chạy lại schema.

## Tài khoản ở góc phải

Khi chưa đăng nhập, nút Đăng nhập trên đầu trang đưa focus vào form. Sau đăng nhập, góc phải hiển thị tên shop và Đăng xuất trên cả desktop/mobile. Bấm tên shop để đổi tên hiển thị của tài khoản; giá trị lưu trong Supabase Auth user metadata `shop_name`, chỉ dùng làm nhãn giao diện, không dùng để phân quyền. Khi chưa đặt tên, hiển thị tên organization hiện có. Không cần migration SQL. Đăng xuất xóa trạng thái tài khoản/workspace đang hiển thị và quay lại form.

Kiểm tra giao diện tài khoản: chạy server với cấu hình Supabase ở cổng 5173 rồi `CHROMIUM_PATH=/usr/bin/chromium node tests/account-smoke.mjs`. Bài kiểm tra giả lập API Supabase, không tạo/sửa tài khoản thật và không chứng minh dịch vụ Auth thật hoạt động.

## Ảnh tài sản

Mỗi tài sản có một ảnh, tải lúc tạo hoặc qua nút Thêm ảnh/Đổi ảnh trên thẻ. Hỗ trợ JPG, PNG, WebP tối đa 5 MB, kiểm tra ảnh giải mã được và mỗi chiều không quá 12.000 pixel. Có xem trước và gỡ ảnh. Tài sản cũ không có ảnh vẫn hoạt động.

Trước khi tải ảnh thật: chạy toàn bộ `supabase/migrations/20261112_asset_images.sql` một lần trong SQL Editor của Supabase riêng của ứng dụng. Script tạo bucket PRIVATE asset-images; không chạy lại schema gốc. Đường dẫn object là organization_id/asset_id/random-id.ext. Thành viên cùng shop được đọc; upload/xóa yêu cầu license còn hạn. Ảnh hiển thị qua signed URL hạn một giờ, lấy lại khi tải dữ liệu. Không dùng public URL hoặc service-role key ở frontend.

Ảnh mới chỉ được gắn vào tài sản sau khi upload thành công; nếu lưu records thất bại, ứng dụng thử xóa object mới. Đổi/gỡ ảnh không xóa vĩnh viễn object cũ (tránh làm hỏng dữ liệu tham chiếu/khôi phục); quản trị viên có thể dọn object không còn tham chiếu sau khi kiểm tra. Chế độ demo lưu ảnh dưới dạng data URL trong localStorage, có thể bị giới hạn dung lượng trình duyệt.

Kiểm tra: chạy server demo cổng 5174 rồi `CHROMIUM_PATH=/usr/bin/chromium node tests/asset-images-smoke.mjs`. Kiểm thử demo bao gồm xem trước, thêm/đổi/gỡ, lưu lại sau reload, loại file/kích thước và màn hình mobile. Chính sách Storage và tải ảnh thật vẫn cần kiểm tra trên Supabase sau khi áp dụng migration, với hai shop để xác minh cách ly dữ liệu.

## Trang trưng bày công khai theo shop

Chạy một lần `supabase/migrations/20261112_public_storefront.sql` trong SQL Editor của dự án đang dùng, sau khi đã có schema ứng dụng và bucket ảnh. Migration có thể chạy lại, không xóa dữ liệu. Không chạy lại schema gốc.

Trong quản trị mở Trang trưng bày → nhập tên shop công khai → bật Mở trang trưng bày công khai → Lưu. Sao chép đường dẫn `https://TEN-MIEN/?shop=ORGANIZATION_ID` để gửi khách. Mặc định shop chưa công khai. Cần license còn hạn để mở/sửa trang; trang tạm đóng khi hết hạn. Tắt checkbox và lưu để ngừng công khai.

Khách không cần tài khoản, chỉ nhận tên shop và các trường cho phép: tên/loại tài sản, đơn giá, đơn vị tính, số lượng khả dụng và ảnh. RPC security definer `get_public_storefront` lọc ngay trên database: khả dụng = tổng số lượng − bảo trì − số lượng hợp đồng active. Tài sản một chiếc đang thuê sẽ ẩn; tài sản nhiều chiếc vẫn hiển thị nếu còn chiếc sẵn sàng. Hợp đồng quá hạn còn active vẫn giữ tồn. Quản trị xem tất cả trong Tài sản, kèm số đang thuê/bảo trì. Không cấp quyền đọc records, members, licenses hoặc storefronts cho anon.

Ảnh trong bucket vẫn private. Policy đọc công khai chỉ cho object đang được tham chiếu bởi tài sản còn sẵn sàng của shop đã mở trang và còn license. Signed URL ảnh đã cấp có thể còn hoạt động tối đa một giờ sau khi tài sản hết hàng hoặc shop tắt trang; dữ liệu danh mục kiểm tra lại khi tải trang. Đây là trang giới thiệu, chưa có đặt hàng/thanh toán/giữ chỗ; tồn có thể thay đổi sau khi khách tải trang. Chưa có đồng bộ realtime.

Kiểm tra SQL bằng PostgreSQL local qua PGlite: `node tests/storefront-sql.mjs` (schema Supabase tối thiểu giả lập, dùng migration thật; không thay thế kiểm tra trên Supabase production). Kiểm tra UI với server có cấu hình Supabase cổng 5173: `CHROMIUM_PATH=/usr/bin/chromium node tests/storefront-smoke.mjs` (RPC giả lập, không đọc dữ liệu thật).
