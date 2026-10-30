# Demo lấy chuỗi kết nối

Hai ứng dụng .NET 8: TrungTamApi chạy tại `http://localhost:5290` và DuAnMvc tại `http://localhost:5180`. Không sử dụng Postman.

## Chuẩn bị SQL Server

1. Mở `sql/01_tao_database.sql` trong SSMS và chạy bằng tài khoản có quyền tạo database. Nếu hai database đã tồn tại, script giữ nguyên và chỉ tạo bảng còn thiếu. Tài khoản `thinh082` cần quyền kết nối, đọc/ghi hai bảng Trung tâm và kết nối `DBDuAnDemo`.
2. Mở `sql/02_du_lieu_demo.sql`, thay `THAY_MAT_KHAU` bằng mật khẩu SQL rồi chạy. Đừng lưu hoặc chia sẻ bản script đã điền mật khẩu. Script giả định mật khẩu không chứa dấu nháy đơn, dấu chấm phẩy hoặc ký tự cần escape trong connection string.
3. Nếu muốn làm lại từ đầu sau khi khóa đã xoay, chạy `sql/03_dat_lai_demo.sql` sau khi điền mật khẩu. Script xóa nhật ký gắn với dòng demo và đặt lại khóa cũ.

## Cấu hình và chạy

Trong PowerShell, chạy API trong một cửa sổ (thay mật khẩu trong lệnh; tránh chia sẻ lịch sử lệnh):

```powershell
$env:ConnectionStrings__TrungTam = 'Server=DESKTOP-5FEJ6AV;Database=DBTrungTam;User Id=thinh082;Password=MAT_KHAU;Encrypt=False;TrustServerCertificate=True'
dotnet run --project TrungTamApi
```

Trong cửa sổ khác:

```powershell
dotnet run --project DuAnMvc
```

Mở `http://localhost:5180`. Nhập mã `DEMO01` và chuỗi cũ bên dưới, thay `MAT_KHAU` bằng mật khẩu SQL:

```text
Server=DESKTOP-5FEJ6AV;Database=DBDuAnCuKhongTonTai;User Id=thinh082;Password=MAT_KHAU;Encrypt=False;TrustServerCertificate=True
```

Nút kiểm tra chuỗi cũ sẽ thất bại vì database cũ được cố ý đặt tên không tồn tại. Nút lấy chuỗi mới gọi API; sau khi kết nối `DBDuAnDemo` thành công, MVC gọi xác nhận và API xoay khóa. Chuỗi kết nối mới được hiển thị trên màn hình, không ghi vào appsettings. Kiểm tra `HT_NhatKyLayKetNoi`: hai dòng thành công lần lượt có `XoayKhoa` là 0 và 1. Dùng script đặt lại trước khi thử lại với chuỗi cũ.

Demo chạy HTTP localhost, hiển thị chuỗi kết nối chứa mật khẩu và lưu chuỗi mới dạng rõ ở database Trung tâm; chỉ dùng để học và kiểm thử local. Khi chạy ngoài local cần HTTPS và bảo vệ thông tin bí mật.
