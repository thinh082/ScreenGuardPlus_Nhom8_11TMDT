using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Threading.RateLimiting;
using BaoMatChung;
using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRateLimiter(options => { options.RejectionStatusCode = 429; options.AddPolicy("gioiHan", context =>
    RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ =>
        new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true })); });
var app = builder.Build();
app.UseRateLimiter();
app.MapPost("/api/layketnoi", async (YeuCau yeuCau, HttpContext context, IConfiguration config) =>
{
    var ma = yeuCau.MaDoiTac ?? ""; var gio = yeuCau.Gio ?? ""; var chuKy = yeuCau.ChuKy ?? "";
    var sai = Results.Json(new PhanHoi(401, "Không xác thực được."), statusCode: 401);
    if (ma.Length is 0 or > 100 || gio.Length != 20 || chuKy.Length != 64 ||
        !DateTimeOffset.TryParseExact(gio, "yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var thoiGian) ||
        Math.Abs((DateTimeOffset.UtcNow - thoiGian).TotalMinutes) > 5) return sai;
    byte[] ky;
    try { ky = Convert.FromHexString(chuKy); } catch (FormatException) { return sai; }
    var ketNoi = config.GetConnectionString("TrungTam");
    if (string.IsNullOrWhiteSpace(ketNoi)) return Results.Problem("Chưa cấu hình ConnectionStrings:TrungTam.");
    try
    {
        await using var db = new SqlConnection(ketNoi); await db.OpenAsync();
        await using var tran = (SqlTransaction)await db.BeginTransactionAsync(IsolationLevel.Serializable);
        var danhSach = new List<(int id, string chuoi, byte[] khoaCu, byte[] khoaMoi, bool khopCu, bool khopMoi)>();
        await using (var cmd = new SqlCommand("SELECT Id, ConnectionString, KhoaBatTay FROM dbo.HT_DoiTac WITH (UPDLOCK, HOLDLOCK) WHERE MaDoiTac = @ma AND ChoPhepLayKetNoi = 1 ORDER BY Id", db, tran))
        {
            cmd.Parameters.Add("@ma", SqlDbType.NVarChar, 100).Value = ma;
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var chuoi = reader.GetString(1); var khoaCu = (byte[])reader[2]; byte[] khoaMoi;
                try { khoaMoi = BaoMat.Khoa(chuoi); } catch (ArgumentException) { continue; }
                var khopCu = CryptographicOperations.FixedTimeEquals(ky, BaoMat.ChuKy(khoaCu, ma, gio));
                var khopMoi = CryptographicOperations.FixedTimeEquals(ky, BaoMat.ChuKy(khoaMoi, ma, gio));
                if (khopCu || khopMoi) danhSach.Add((reader.GetInt32(0), chuoi, khoaCu, khoaMoi, khopCu, khopMoi));
            }
        }
        if (danhSach.Count != 1)
        {
            await GhiNhatKy(db, tran, ma, null, null, "SAI_CHU_KY", false, context.Connection.RemoteIpAddress?.ToString());
            await tran.CommitAsync(); return sai;
        }
        var doiTac = danhSach[0];
        await using (var cmd = new SqlCommand("SELECT COUNT(*) FROM dbo.HT_NhatKyLayKetNoi WITH (UPDLOCK, HOLDLOCK) WHERE IdDoiTac = @id AND ChuKy = @ky AND KetQua = 'OK'", db, tran))
        {
            cmd.Parameters.Add("@id", SqlDbType.Int).Value = doiTac.id; cmd.Parameters.Add("@ky", SqlDbType.Binary, 32).Value = ky;
            if ((int)(await cmd.ExecuteScalarAsync())! > 0)
            {
                await GhiNhatKy(db, tran, ma, doiTac.id, null, "GUI_LAI", false, context.Connection.RemoteIpAddress?.ToString());
                await tran.CommitAsync(); return sai;
            }
        }
        var xoay = doiTac.khopMoi && !CryptographicOperations.FixedTimeEquals(doiTac.khoaCu, doiTac.khoaMoi);
        var khoaDung = doiTac.khopCu ? doiTac.khoaCu : doiTac.khoaMoi;
        var duLieu = BaoMat.MaHoa(khoaDung, ma, gio, doiTac.chuoi);
        if (xoay)
        {
            await using var cmd = new SqlCommand("UPDATE dbo.HT_DoiTac SET KhoaBatTay = @khoa WHERE Id = @id", db, tran);
            cmd.Parameters.Add("@khoa", SqlDbType.Binary, 32).Value = doiTac.khoaMoi; cmd.Parameters.Add("@id", SqlDbType.Int).Value = doiTac.id; await cmd.ExecuteNonQueryAsync();
        }
        await GhiNhatKy(db, tran, ma, doiTac.id, ky, "OK", xoay, context.Connection.RemoteIpAddress?.ToString());
        await tran.CommitAsync();
        return Results.Ok(new PhanHoi(200, DuLieu: duLieu));
    }
    catch (SqlException) { return Results.Problem("Không thể xử lý yêu cầu với database Trung tâm."); }
}).RequireRateLimiting("gioiHan");
app.Run();

static async Task GhiNhatKy(SqlConnection db, SqlTransaction tran, string ma, int? id, byte[]? ky, string ketQua, bool xoay, string? ip)
{
    await using var cmd = new SqlCommand("INSERT dbo.HT_NhatKyLayKetNoi (Gio, MaDoiTac, IdDoiTac, ChuKy, KetQua, XoayKhoa, IpAddress) VALUES (SYSUTCDATETIME(), @ma, @id, @ky, @ketQua, @xoay, @ip)", db, tran);
    cmd.Parameters.Add("@ma", SqlDbType.NVarChar, 100).Value = ma;
    cmd.Parameters.Add("@id", SqlDbType.Int).Value = (object?)id ?? DBNull.Value;
    cmd.Parameters.Add("@ky", SqlDbType.Binary, 32).Value = (object?)ky ?? DBNull.Value;
    cmd.Parameters.Add("@ketQua", SqlDbType.VarChar, 30).Value = ketQua;
    cmd.Parameters.Add("@xoay", SqlDbType.Bit).Value = xoay;
    cmd.Parameters.Add("@ip", SqlDbType.NVarChar, 45).Value = (object?)ip ?? DBNull.Value;
    await cmd.ExecuteNonQueryAsync();
}
