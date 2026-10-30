USE DBTrungTam;
GO
-- Dien mat khau SQL cua ban truoc khi chay; khong luu file da dien mat khau len git.
DECLARE @matKhau nvarchar(128) = N'THAY_MAT_KHAU';
IF @matKhau = N'THAY_MAT_KHAU' THROW 50000, N'Hay dien mat khau SQL vao script.', 1;
IF EXISTS (SELECT 1 FROM dbo.HT_DoiTac WHERE MaDoiTac = N'DEMO01') THROW 50000, N'DEMO01 da ton tai. Dung script dat lai neu muon thu lai.', 1;
DECLARE @chuoiCu nvarchar(max) = N'Server=DESKTOP-5FEJ6AV;Database=DBDuAnCuKhongTonTai;User Id=thinh082;Password=' + @matKhau + N';Encrypt=False;TrustServerCertificate=True';
DECLARE @chuoiMoi nvarchar(max) = N'Server=DESKTOP-5FEJ6AV;Database=DBDuAnDemo;User Id=thinh082;Password=' + @matKhau + N';Encrypt=False;TrustServerCertificate=True';
DECLARE @chuanHoa nvarchar(max) = N'desktop-5fej6av|dbduancukhongtontai|thinh082|' + @matKhau;
DECLARE @khoa binary(32) = HASHBYTES('SHA2_256', CONVERT(varchar(max), @chuanHoa COLLATE Latin1_General_100_BIN2_UTF8));
INSERT dbo.HT_DoiTac (MaDoiTac, TenDoiTac, ConnectionString, KhoaBatTay, ChoPhepLayKetNoi)
VALUES (N'DEMO01', N'Đối tác demo', @chuoiMoi, @khoa, 1);
PRINT N'Da tao doi tac DEMO01. Nhap chuoi cu nhu huong dan trong README.';
GO
