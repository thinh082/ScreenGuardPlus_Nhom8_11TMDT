USE DBTrungTam;
GO
DECLARE @matKhau nvarchar(128) = N'THAY_MAT_KHAU';
IF @matKhau = N'THAY_MAT_KHAU' THROW 50000, N'Hay dien mat khau SQL vao script.', 1;
IF (SELECT COUNT(*) FROM dbo.HT_DoiTac WHERE MaDoiTac = N'DEMO01' AND TenDoiTac = N'Đối tác demo') <> 1 THROW 50000, N'Khong tim thay duy nhat doi tac demo.', 1;
DECLARE @id int = (SELECT Id FROM dbo.HT_DoiTac WHERE MaDoiTac = N'DEMO01' AND TenDoiTac = N'Đối tác demo');
DECLARE @chuanHoa nvarchar(max) = N'desktop-5fej6av|dbduancukhongtontai|thinh082|' + @matKhau;
BEGIN TRAN;
DELETE FROM dbo.HT_NhatKyLayKetNoi WHERE IdDoiTac = @id;
UPDATE dbo.HT_DoiTac SET ConnectionString = N'Server=DESKTOP-5FEJ6AV;Database=DBDuAnDemo;User Id=thinh082;Password=' + @matKhau + N';Encrypt=False;TrustServerCertificate=True', KhoaBatTay = HASHBYTES('SHA2_256', CONVERT(varchar(max), @chuanHoa COLLATE Latin1_General_100_BIN2_UTF8)), ChoPhepLayKetNoi = 1 WHERE Id = @id;
COMMIT;
GO
