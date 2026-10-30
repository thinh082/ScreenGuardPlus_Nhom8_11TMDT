using System.Globalization;
using System.Net.Http.Json;
using BaoMatChung;
using DuAnMvc.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace DuAnMvc.Controllers;
public class HomeController(IConfiguration config, IHttpClientFactory factory) : Controller
{
    [HttpGet] public IActionResult Index() => View(new KetNoiModel { MaDoiTac = config["TrungTam:MaDoiTac"] });
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Index(KetNoiModel model, string thaoTac)
    {
        model.ChuoiMoi = null; ModelState.Remove(nameof(model.ChuoiMoi));
        if (string.IsNullOrWhiteSpace(model.ChuoiCu)) { model.ThongBao = "Vui lòng nhập chuỗi kết nối cũ."; return View(model); }
        if (thaoTac == "kiemTra")
        {
            model.ThongBao = await KiemTra(model.ChuoiCu) ? "Kết nối database thành công." : "Không kết nối được database bằng chuỗi đã nhập.";
            return View(model);
        }
        if (string.IsNullOrWhiteSpace(model.MaDoiTac)) { model.ThongBao = "Vui lòng nhập mã cơ sở."; return View(model); }
        try
        {
            var moi = await Lay(model.ChuoiCu, model.MaDoiTac);
            model.ChuoiMoi = moi;
            if (!await KiemTra(moi)) { model.ThongBao = "Đã nhận chuỗi mới nhưng không kết nối được database; chưa xác nhận xoay khóa."; return View(model); }
            try
            {
                if (System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(BaoMat.Khoa(model.ChuoiCu), BaoMat.Khoa(moi)))
                    await Task.Delay(1100);
                await Lay(moi, model.MaDoiTac);
                model.ThongBao = "Đã nhận chuỗi mới, kết nối database thành công và xác nhận xoay khóa.";
            }
            catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or System.Security.Cryptography.CryptographicException or FormatException or TaskCanceledException)
            { model.ThongBao = "Đã kết nối database mới nhưng xác nhận thất bại. Cần thử xác nhận lại và kiểm tra nhật ký Trung tâm."; }
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or ArgumentException or System.Security.Cryptography.CryptographicException or FormatException or TaskCanceledException)
        { model.ThongBao = "Không lấy được chuỗi mới. Kiểm tra cấu hình, mã cơ sở, chuỗi cũ và API."; }
        return View(model);
    }
    private static async Task<bool> KiemTra(string chuoi)
    {
        try { var b = new SqlConnectionStringBuilder(chuoi) { ConnectTimeout = 3 }; await using var db = new SqlConnection(b.ConnectionString); await db.OpenAsync(); return true; }
        catch (Exception ex) when (ex is SqlException or ArgumentException or InvalidOperationException) { return false; }
    }
    private async Task<string> Lay(string chuoi, string ma)
    {
        var khoa = BaoMat.Khoa(chuoi);
        var gio = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
        var yeuCau = new YeuCau(ma, gio, Convert.ToHexString(BaoMat.ChuKy(khoa, ma, gio)).ToLowerInvariant());
        var url = config["TrungTam:ApiUrl"] ?? throw new InvalidOperationException();
        using var response = await factory.CreateClient().PostAsJsonAsync(url.TrimEnd('/') + "/api/layketnoi", yeuCau);
        response.EnsureSuccessStatusCode();
        var ketQua = await response.Content.ReadFromJsonAsync<PhanHoi>();
        if (ketQua?.StatusCode != 200 || string.IsNullOrEmpty(ketQua.DuLieu)) throw new InvalidOperationException();
        return BaoMat.GiaiMa(khoa, ma, gio, ketQua.DuLieu);
    }
}
