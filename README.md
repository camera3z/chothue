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
2. Chạy `supabase/schema.sql` một lần trong SQL editor của dự án mới. Sau đó chạy các migration theo thứ tự: `20261112_asset_images.sql`, `20261112_public_storefront.sql`, `20261112_booking_requests.sql` trong `supabase/migrations`. Dự án đang dùng chỉ chạy migration mới còn thiếu; không chạy lại schema gốc.
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

Có ảnh tài sản, đặt thuê công khai chờ duyệt và giữ chỗ theo thời gian sau khi duyệt. Đơn thủ công nhập đơn giá riêng theo ngày/tháng/năm và tự tính số kỳ; đơn web có giá dự kiến và giá thỏa thuận cuối cùng. Thanh toán được ghi nhận thủ công; chưa tích hợp bán key tự động, hóa đơn, cổng thanh toán, đơn vị giao nhận, mã từng món, phí trễ hạn tự động hoặc khấu hao.

Dữ liệu MVP lưu một JSON document cho mỗi workspace, yêu cầu đặt thuê ở bảng riêng. Sau migration đặt thuê, RPC khóa dòng và kiểm tra version để chống ghi đè khi có nhiều phiên; tab cũ phải tải lại khi phiên bản đổi. Nhật ký thu/hoàn được lưu trong hợp đồng. Tách bảng giao dịch độc lập vẫn cần thiết khi quy mô dữ liệu lớn. Người mua có thể sửa dữ liệu workspace của mình qua API nhưng không thể tự cấp bản quyền hoặc truy cập workspace khác. Cần bổ sung rate limiting cho RPC kích hoạt key trước khi mở bán công khai.

## RENTOS — bàn điều hành cho thuê

Bản giao diện mới dùng tên RENTOS, tông xanh đậm/cam và màn hình đăng nhập hai cột. Bàn điều hành theo dõi tài sản đang thuê, lịch hẹn trả trong ngày, hợp đồng quá hạn, công nợ và kho khả dụng. Lịch giao–trả hiển thị từng ngày trong tuần; danh sách hợp đồng lọc theo đang thuê/quá hạn/đã trả.

Tiền cọc tách riêng tiền thuê: nhập cọc khi tạo hợp đồng, hoàn một phần hoặc toàn bộ khi nhận trả, và hoàn phần còn lại trong Công nợ & tiền cọc. Chi tiết hợp đồng lưu ghi chú giao/nhận và nhật ký các lần thu/hoàn từ phiên bản này. Hợp đồng cũ vẫn đọc được; không tự tạo nhật ký giả cho các khoản thu cũ. Tài sản bảo trì bị trừ khỏi tồn khả dụng; cập nhật số lượng bảo trì về 0 khi hoàn tất. Dữ liệu bổ sung dùng các trường JSON tùy chọn trong records, không cần chạy lại schema SQL hay xóa dữ liệu.

Lịch UI thể hiện ngày giao/hẹn trả; kiểm tra đặt chỗ mới dùng timestamp chính xác ở database. Chưa hỗ trợ hợp đồng nhiều dòng tài sản, trả từng phần, tự động tính phí trễ/hư hỏng hoặc khấu trừ cọc. Không tự quy đổi tổng đơn vị giữa các ngành; người dùng cần đặt danh mục và đơn vị tính phù hợp.

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

Chỉ áp dụng giao diện và các thao tác tương thích với mô hình dữ liệu hiện tại. Không nhập dữ liệu mẫu, mã JavaScript demo hoặc cơ chế workspace local của file mẫu vào Supabase. Đặt chỗ theo giờ được bổ sung trong migration đặt thuê bên dưới. Trường động theo loại hình và hủy hợp đồng đã duyệt chưa được triển khai; khách có thể hủy yêu cầu còn chờ duyệt bằng liên kết riêng. Chế độ Supabase và cấp key giữ nguyên, không cần chạy lại schema.

## Tài khoản ở góc phải

Khi chưa đăng nhập, nút Đăng nhập trên đầu trang đưa focus vào form. Sau đăng nhập, góc phải hiển thị tên shop; trên desktop nút Đăng xuất nằm cùng dòng Đổi sáng/tối dưới menu, trên mobile nút Đăng xuất ở khu vực tài khoản. Bấm tên shop để đổi tên hiển thị của tài khoản; giá trị lưu trong Supabase Auth user metadata `shop_name`, chỉ dùng làm nhãn giao diện, không dùng để phân quyền. Khi chưa đặt tên, hiển thị tên organization hiện có. Không cần migration SQL. Đăng xuất xóa trạng thái tài khoản/workspace đang hiển thị và quay lại form.

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

Ảnh trong bucket vẫn private. Policy đọc công khai chỉ cho object đang được tham chiếu bởi tài sản còn sẵn sàng của shop đã mở trang và còn license. Signed URL ảnh đã cấp có thể còn hoạt động tối đa một giờ sau khi tài sản hết hàng hoặc shop tắt trang; dữ liệu danh mục kiểm tra lại khi tải trang. Trang có gửi yêu cầu thuê và giữ chỗ sau duyệt theo migration đặt thuê bên dưới, chưa có thanh toán trực tuyến. Tồn có thể thay đổi sau khi khách tải trang; danh mục cập nhật bằng polling 30 giây.

Kiểm tra SQL bằng PostgreSQL local qua PGlite: `node tests/storefront-sql.mjs` (schema Supabase tối thiểu giả lập, dùng migration thật; không thay thế kiểm tra trên Supabase production). Kiểm tra UI với server có cấu hình Supabase cổng 5173: `CHROMIUM_PATH=/usr/bin/chromium node tests/storefront-smoke.mjs` (RPC giả lập, không đọc dữ liệu thật).

Trang khách không còn nút/link quản trị hoặc đăng nhập. Danh mục tự tải lại mỗi 30 giây khi tab đang hiển thị và khi quay lại tab, giữ từ khóa tìm kiếm/bộ lọc. Khi quản trị ghi nhận đơn active làm hết số lượng khả dụng, tài sản sẽ ẩn; ghi nhận trả hàng trả lại tồn và tài sản xuất hiện ở lần cập nhật tiếp theo. Không tự coi hợp đồng hết ngày hẹn là đã trả. Truy cập quản trị vẫn dùng đường dẫn gốc riêng, không đặt liên kết trên trang khách.

## Khách đặt thuê → quản trị duyệt

**Nâng cấp:** chạy toàn bộ `supabase/migrations/20261112_booking_requests.sql` trong Supabase SQL Editor sau migration trang trưng bày, rồi cập nhật code/build trên VPS và tải lại các tab quản trị. Không chạy lại schema gốc. Migration thêm bảng yêu cầu và `records.version`; thay mọi thao tác ghi records bằng RPC kiểm tra phiên bản và license. Các tab/code cũ dùng upsert trực tiếp sẽ không ghi được sau nâng cấp.

- Trang khách có nút Đặt thuê: tên, SĐT, thời gian bắt đầu/kết thúc, số lượng, ghi chú và đồng ý gửi thông tin cho shop. Giá dự kiến do server tính lại từ đơn giá tài sản; tháng tạm tính 30 ngày, chưa bao gồm cọc/giao nhận/phụ phí.
- Yêu cầu chờ duyệt không giữ tồn và không tạo khoản thu. Khách nhận mã và liên kết riêng ở lần gửi thành công đầu tiên (token ở URL fragment; lần gửi lại cùng mã chỉ trả xác nhận, không phát lại token) để xem trạng thái/tự hủy khi còn pending. Sau duyệt phải liên hệ shop; không cho khách tự thay đổi hợp đồng. Không chia sẻ liên kết riêng cho người khác.
- Quản trị vào Yêu cầu đặt thuê → Làm mới → Xem xét. Có thể sửa tên/SĐT, thời gian, số lượng, tổng tiền thuê, cọc yêu cầu và điều khoản, rồi duyệt hoặc từ chối. Duyệt tạo hợp đồng `reserved` (Đã duyệt · Chờ giao), không tự coi cọc thỏa thuận là tiền đã nhận. Không ghi đè hồ sơ khách cũ khi trùng SĐT; hợp đồng lưu snapshot tên/SĐT thỏa thuận.
- Đơn thuê → Chỉnh lịch để sửa thỏa thuận trước giao; Giao tài sản để chuyển active; Nhận trả để chuyển returned. Công nợ & tiền cọc có Nhận cọc, Thu tiền, Hoàn cọc riêng.

**Lịch và tồn:** booking mới dùng khoảng thời gian nửa mở `[bắt đầu,kết thúc)`, nên hai đơn nối tiếp đúng giờ được phép. So sánh đỉnh sử dụng đồng thời, không cộng sai các đơn rời nhau; trừ số bảo trì. Đơn date-only cũ giữ đến hết ngày cuối theo Asia/Bangkok. Active vẫn giữ hàng cho đến nhận trả; nếu đã quá giờ hẹn thì chặn lịch tương lai vô hạn đến lúc trả. Giữ chỗ tương lai không làm ẩn tài sản đang còn sẵn sàng hiện tại; đến khoảng đã giữ, tồn sẵn sàng giảm. Khi giao sớm/chậm, tạo đơn thủ công hoặc đưa vào bảo trì, server kiểm tra lại lịch. Lịch UI vẫn hiển thị theo ngày, giờ chính xác trong Chi tiết; form dùng múi giờ thiết bị rồi gửi timestamp UTC.

**Đồng thời và quyền:** review khóa dòng records và yêu cầu trong cùng transaction, kiểm tra lại tồn, tạo khách/hợp đồng và tăng version nguyên tử. Save RPC cũng khóa cùng dòng, từ chối phiên bản cũ; nếu báo dữ liệu đã đổi, tải lại và nhập lại thay đổi. Chặn duyệt hai lần; khách ẩn danh không được SELECT/INSERT/UPDATE bảng requests, chỉ dùng RPC có kiểm tra input/shop công khai/license. RPC đọc/hủy bằng token chỉ trả trạng thái, không lộ thông tin liên hệ. Không tự gửi email/SMS hoặc thông báo ra ngoài; quản trị chủ động Làm mới và liên hệ khách.

**Chống spam cơ bản:** honeypot, giới hạn input, UUID idempotency, tối đa 3 yêu cầu/SĐT/shop/giờ và 100 yêu cầu/shop/giờ (bao gồm đơn đã hủy/từ chối). Đây không thay thế CAPTCHA/IP rate limit tại gateway; khi mở bán rộng nên tích hợp CAPTCHA có xác minh server. Yêu cầu chỉ gửi trong 2 năm tới, thời lượng tối đa 366 ngày, tối đa 10.000 đơn vị/yêu cầu. Giới hạn chống spam theo shop có thể làm chậm nhận yêu cầu khi lưu lượng tăng; không coi đây là chống bot hoàn chỉnh.

Kiểm tra SQL local: `node tests/booking-sql.mjs` dùng migration thật trong PGlite với các schema Supabase tối thiểu; kiểm tra quyền, validation, quota, idempotency, duyệt/trùng lịch, biên nối tiếp, hủy bằng token, phiên bản cũ, giao/trả và bảo trì. `CHROMIUM_PATH=/usr/bin/chromium node tests/booking-ui.mjs` với server Supabase-configured tại cổng 5173 kiểm tra UI qua API giả lập. Cần kiểm tra tích hợp lại trên Supabase thật sau khi áp dụng SQL; chưa có kiểm thử nhiều kết nối PostgreSQL production đồng thời.

## Đơn giá riêng khi tạo hợp đồng thủ công

Form Tạo hợp đồng thay ô Số đơn vị tính tiền bằng Đơn giá thỏa thuận và lựa chọn ngày/tháng/năm. Tự tính số kỳ và tổng tiền = đơn giá nhập × số tài sản × số kỳ, hiển thị ngay trước khi lưu. Tính cả ngày cuối; tháng/năm theo chu kỳ lịch từ ngày bắt đầu, làm tròn kỳ lẻ lên và điều chỉnh ngày cuối tháng (ví dụ 01/01–31/01 là một tháng; 01/01–01/02 là hai kỳ vì tính cả ngày 01/02). Đơn giá mặc định lấy từ tài sản nếu đơn vị phù hợp; với đơn vị giờ/tuần/lượt cũ phải nhập lại giá theo ngày/tháng/năm. Chọn đơn vị mới không tự quy đổi tiền.

Lưu snapshot `unitPrice`, `billingUnit`, `periods` trên hợp đồng, không thay đơn giá tài sản hoặc tổng tiền của hợp đồng cũ. Thay đổi này không sửa giá dự kiến ở form đặt thuê công khai và không thay giới hạn thời lượng ở server. Không cần migration SQL. Kiểm tra công thức: `node tests/rental-pricing.mjs`; kiểm tra form demo: `CHROMIUM_PATH=/usr/bin/chromium node tests/contract-pricing-ui.mjs` (server demo cổng 5174).

## Hiển thị ô nhập tiền

Các ô tiền trong hộp thoại quản trị (đơn giá, tiền thuê đã thu, cọc, tổng tiền thỏa thuận, thu/hoàn tiền) hiển thị dấu chấm hàng nghìn và ký hiệu ₫ riêng, dùng bàn phím số trên di động. Form chuyển về số nguyên trước khi tính và lưu; không lưu chuỗi có dấu phân cách vào các trường số. Hỗ trợ dán định dạng nhóm nghìn hợp lệ; từ chối số âm, ký hiệu mũ, số thập phân hoặc nhóm phân cách không rõ ràng khi dán. Dữ liệu và giá trị hợp đồng cũ giữ nguyên, không cần SQL. Kiểm tra helper: `node tests/money-input.mjs`.

## Xác nhận ngày trên lịch hợp đồng

Các ô date trong hộp thoại quản trị dùng lịch tùy chỉnh có nút Chọn: bấm ngày chỉ đánh dấu, bấm Chọn mới ghi vào form và cập nhật tiền thuê. Hôm nay/Xóa cũng cần Chọn để xác nhận; đóng hoặc Esc hủy thay đổi đang chọn. Có chọn tháng/năm, bàn phím mũi tên trong lưới, Alt+↓ hoặc F4 tại ô để mở lịch, hỗ trợ sáng/tối và màn hình nhỏ. Các ô datetime-local (đặt thuê theo giờ) vẫn giữ bộ chọn ngày giờ riêng của trình duyệt. Không cần SQL. Kiểm tra: `CHROMIUM_PATH=/usr/bin/chromium node tests/date-picker-ui.mjs` với server demo cổng 5174.
