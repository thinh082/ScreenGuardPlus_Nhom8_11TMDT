# Lấy kết nối từ Trung tâm thông báo

## Tích hợp phía phần mềm khách

Chép `LayKetNoiTuTTTB.cs` vào dự án .NET 6 trở lên. Khi khởi động, thử mở database bằng chuỗi trong `ConnectionStrings`. Chỉ khi mở thất bại, gọi `LayChuoiMoiAsync(http, diaChi, maCSKCB, chuoiCu)`. Nếu kết quả null thì báo lỗi và giữ cấu hình cũ; nếu có kết quả, gọi `GhiAppsettings(duongDan, tenKetNoi, chuoiMoi)`, rồi thử kết nối database mới. Sau khi kết nối thành công, gọi ngay `XacNhanAsync(http, diaChi, maCSKCB, chuoiMoi)` để Trung tâm xoay khoá. Nếu xác nhận thất bại, thử lại và báo vận hành; không coi việc xoay khoá là đã hoàn tất.

Khi database khách còn hoạt động, lấy địa chỉ Trung tâm từ `ThongTinDoanhNghiep.APITrungTamThongBao`. Khi database không truy cập được, dùng `TTTB:DiaChi` trong appsettings. Phải dùng HTTPS trong môi trường vận hành. Phương thức ghi tạo bản sao nguyên vẹn tại `<appsettings>.bak` trước khi thay đúng `ConnectionStrings:<tenKetNoi>`; bảo vệ cả hai file vì chúng chứa thông tin bí mật.

## Vận hành tại Trung tâm

User chạy `01_TTTB_LayKetNoi_CREATE.sql` trên database Trung tâm; ứng dụng tự điền khoá còn trống khi khởi động hoặc khi gọi. Tính năng mặc định tắt. Quản trị viên đăng nhập màn **Khoá lấy kết nối**, chọn đúng đối tác theo ID và đích DB, rồi bật công tắc. Có thể đặt lại khoá bằng cách dán chuỗi hiện có của phần mềm khách, kiểm tra đích rồi lưu; khoá và mật khẩu không được hiển thị.

Khi đổi database của một đối tác, người vận hành cập nhật **chỉ chuỗi hiện hành** tại Trung tâm theo ID đã xác minh, ví dụ (thay tham số bằng giá trị được duyệt):

```sql
UPDATE dbo.HT_DoiTac SET ConnectionString = @ChuoiMoi WHERE Id = @IdDoiTac;
```

Không cập nhật `KhoaBatTay` cùng lúc: khách cần khoá cũ để xác thực và nhận chuỗi mới. Sau khi khách nối được DB mới và gửi xác nhận, kiểm tra nhật ký của đúng đối tác:

```sql
SELECT TOP (20) Gio, IDDoiTac, KetQua, XoayKhoa
FROM dbo.HT_NhatKyLayKetNoi WHERE IDDoiTac = @IdDoiTac ORDER BY ID DESC;
```

**Chờ thấy `KetQua='OK'` và `XoayKhoa=1` rồi mới đổi DB lần nữa.** Không dùng mã đối tác để xác định duy nhất một dòng. Trường hợp cần rollback, script `99_ROLLBACK.sql` xoá khoá, quyền bật và toàn bộ nhật ký; sao lưu dữ liệu cần giữ trước khi user thực hiện.

## Giao thức và kiểm thử

Yêu cầu gồm mã đối tác, giờ UTC và chữ ký HMAC; sai hoặc quá hạn trả cùng thông báo 401, một chữ ký thành công chỉ dùng một lần. Dữ liệu trả về được mã hoá AES-CBC và xác thực HMAC; lớp mẫu kiểm MAC trước khi giải mã. Giới hạn là 10 yêu cầu/phút/IP. Bộ Postman đi kèm dùng dữ liệu do người kiểm thử tự nhập, không lưu mật khẩu thật trong bộ bàn giao.

Nhật ký được tự dọn các dòng quá 3 tháng khi ứng dụng khởi động và mỗi 24 giờ; chữ ký quá 5 phút đã hết hạn nên việc dọn không làm mất khả năng chặn gửi lại.

## Test bằng Postman (đồng nghiệp) — dữ liệu thử đang để sẵn

Trên `Chinh_TTTBSixOs` đang để lại 3 dòng `HT_DoiTac` loại `ZZTEST` (chuỗi kết nối **giả** `zz.invalid`, không trỏ DB thật), ở đúng trạng thái đầu của bộ Postman:

| Id | Tên | Mã | Cho phép | Tình huống |
|---|---|---|---|---|
| 20079 | ZZTEST dong A | ZZTEST1 | 1 | DB "đã đổi" sang `zz2.invalid`/`ZZ_pw2`, khoá còn là của chuỗi CŨ (PM khách vừa mất DB) |
| 20080 | ZZTEST dong B | ZZTEST1 | 1 | trùng mã với A, cùng mật khẩu, khác tên DB |
| 20081 | ZZTEST dong C | ZZTEST2 | 0 | không cho phép lấy kết nối |

Các bước:
1. Import `TTTB_LayKetNoi.postman_collection.json` + `TTTB_LayKetNoi_ZZTEST.postman_environment.json` (đã điền sẵn 3 chuỗi giả).
   Sửa biến `diaChi` thành địa chỉ TTTB đang chạy bản có API này (mặc định `http://localhost:5154`).
2. Chạy cả collection theo thứ tự `00 → 07` một lượt (Collection Runner). Kỳ vọng 8 request, 21/21 test đạt.
   Không chạy quá 10 request/phút từ một IP (sẽ nhận 429).
3. Chạy lại lần nữa: bước 05 đã xoay khoá dòng A nên lần hai bước 01 sẽ 401 — phải chạy
   `docs/sql-da-giao/2026-10-29_tttb-lay-ket-noi/sql/04_TEST_postman_reset.sql` trước mỗi lượt chạy mới.
4. Kiểm DB: mỗi request có mô tả câu SELECT trên `HT_NhatKyLayKetNoi` / `HT_DoiTac` (chỉ đọc).
5. Test xong hẳn: chạy `98_TEST_cleanup.sql` (xoá 3 dòng ZZTEST + nhật ký ZZTEST). Trong lúc còn dữ liệu thử, 3 dòng này hiện trên trang chính TTTB.
