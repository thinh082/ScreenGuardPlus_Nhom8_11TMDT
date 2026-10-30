USE master;
GO
IF DB_ID(N'DBTrungTam') IS NULL CREATE DATABASE DBTrungTam;
GO
IF DB_ID(N'DBDuAnDemo') IS NULL CREATE DATABASE DBDuAnDemo;
GO
USE DBDuAnDemo;
GO
IF OBJECT_ID(N'dbo.ThongTinDemo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ThongTinDemo (Id int IDENTITY PRIMARY KEY, NoiDung nvarchar(200) NOT NULL);
    INSERT dbo.ThongTinDemo (NoiDung) VALUES (N'Database dự án demo hoạt động');
END;
GO
USE DBTrungTam;
GO
IF OBJECT_ID(N'dbo.HT_DoiTac', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.HT_DoiTac (
        Id int IDENTITY PRIMARY KEY,
        MaDoiTac nvarchar(100) NOT NULL,
        TenDoiTac nvarchar(200) NOT NULL,
        ConnectionString nvarchar(max) NOT NULL,
        KhoaBatTay binary(32) NOT NULL,
        ChoPhepLayKetNoi bit NOT NULL DEFAULT 0
    );
    CREATE INDEX IX_HT_DoiTac_Ma ON dbo.HT_DoiTac (MaDoiTac, ChoPhepLayKetNoi);
END;
GO
IF OBJECT_ID(N'dbo.HT_NhatKyLayKetNoi', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.HT_NhatKyLayKetNoi (
        Id bigint IDENTITY PRIMARY KEY,
        Gio datetime2 NOT NULL,
        MaDoiTac nvarchar(100) NOT NULL,
        IdDoiTac int NULL REFERENCES dbo.HT_DoiTac(Id),
        ChuKy binary(32) NULL,
        KetQua varchar(30) NOT NULL,
        XoayKhoa bit NOT NULL,
        IpAddress nvarchar(45) NULL
    );
    CREATE UNIQUE INDEX UX_NhatKy_ChuKyThanhCong ON dbo.HT_NhatKyLayKetNoi (IdDoiTac, ChuKy) WHERE ChuKy IS NOT NULL;
END;
GO
