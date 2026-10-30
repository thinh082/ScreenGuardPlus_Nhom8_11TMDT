using System;
using System.Linq;
using System.Text;
using System.Security.Cryptography;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace LayKetNoiMau;
public static class LayKetNoiTuTTTB
{

    public static string ChuanHoa(string? chuoi)
    {
        if (string.IsNullOrWhiteSpace(chuoi)) return "";
        try
        {
            var b = new System.Data.Common.DbConnectionStringBuilder { ConnectionString = chuoi };
            string Lay(params string[] ten) { foreach (var t in ten) if (b.TryGetValue(t, out var v)) return Convert.ToString(v) ?? ""; return ""; }
            var server = Lay("server", "data source", "address", "addr").Trim().ToLowerInvariant();
            if (server.StartsWith("tcp:")) server = server.Substring(4).Trim();
            var db = Lay("database", "initial catalog").Trim().ToLowerInvariant();
            var user = Lay("user id", "uid", "user", "username").Trim().ToLowerInvariant();
            var password = Lay("password", "pwd");
            if (server.Length == 0 || db.Length == 0 || user.Length == 0 || password.Length == 0) return "";
            return server + "|" + db + "|" + user + "|" + password;
        }
        catch { return ""; }
    }
    public static byte[] Khoa(string chuoi) => SHA256.HashData(Encoding.UTF8.GetBytes(ChuanHoa(chuoi)));
    public static string ChuKy(byte[] k, string ma, string gio) => Convert.ToHexString(HMACSHA256.HashData(k, Encoding.UTF8.GetBytes(ma + "|" + gio))).ToLowerInvariant();
    private static byte[] KhoaPhu(byte[] k, string suffix) => SHA256.HashData(k.Concat(Encoding.UTF8.GetBytes(suffix)).ToArray());
    public static string MaHoa(byte[] k, string ma, string gio, string chuoi)
    {
        using var aes = Aes.Create(); aes.Key = KhoaPhu(k, "|ENC"); aes.GenerateIV();
        using var enc = aes.CreateEncryptor(); var plain = Encoding.UTF8.GetBytes(chuoi); var ct = enc.TransformFinalBlock(plain, 0, plain.Length);
        var mac = HMACSHA256.HashData(KhoaPhu(k, "|MAC"), Encoding.UTF8.GetBytes(ma + "|" + gio).Concat(aes.IV).Concat(ct).ToArray());
        return Convert.ToBase64String(aes.IV.Concat(ct).Concat(mac).ToArray());
    }
    public static string? GiaiMa(byte[] k, string ma, string gio, string duLieu)
    {
        try {
            var data = Convert.FromBase64String(duLieu); if (data.Length < 64 || (data.Length - 48) % 16 != 0) return null;
            var iv = data.Take(16).ToArray(); var ct = data.Skip(16).Take(data.Length - 48).ToArray(); var mac = data.Skip(data.Length - 32).ToArray();
            var expected = HMACSHA256.HashData(KhoaPhu(k, "|MAC"), Encoding.UTF8.GetBytes(ma + "|" + gio).Concat(iv).Concat(ct).ToArray());
            if (!CryptographicOperations.FixedTimeEquals(mac, expected)) return null;
            using var aes = Aes.Create(); aes.Key = KhoaPhu(k, "|ENC"); aes.IV = iv; using var dec = aes.CreateDecryptor();
            return Encoding.UTF8.GetString(dec.TransformFinalBlock(ct, 0, ct.Length));
        } catch { return null; }
    }

    public static async Task<string?> LayChuoiMoiAsync(HttpClient http, string diaChi, string maCSKCB, string chuoiCu)
    {
        try {
            if (ChuanHoa(chuoiCu).Length == 0) return null;
            var k = Khoa(chuoiCu); var gio = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", System.Globalization.CultureInfo.InvariantCulture);
            var body = JsonSerializer.Serialize(new { maCSKCB, gio, chuKy = ChuKy(k, maCSKCB, gio) });
            using var res = await http.PostAsync(diaChi.TrimEnd('/') + "/api/layketnoi", new StringContent(body, Encoding.UTF8, "application/json"));
            using var json = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            if (!res.IsSuccessStatusCode || !json.RootElement.TryGetProperty("statusCode", out var sc) || sc.GetInt32() != 200) return null;
            return GiaiMa(k, maCSKCB, gio, json.RootElement.GetProperty("duLieu").GetString() ?? "");
        } catch { return null; }
    }
    public static async Task<bool> XacNhanAsync(HttpClient http, string diaChi, string maCSKCB, string chuoiMoi) => await LayChuoiMoiAsync(http, diaChi, maCSKCB, chuoiMoi) != null;
    public static void GhiAppsettings(string duongDan, string tenKetNoi, string chuoiMoi)
    {
        var original = File.ReadAllBytes(duongDan);
        var root = JsonNode.Parse(original)?.AsObject() ?? throw new InvalidDataException("JSON khong hop le");
        var connections = root["ConnectionStrings"]?.AsObject() ?? throw new InvalidDataException("Thieu ConnectionStrings");
        connections[tenKetNoi] = chuoiMoi;
        File.WriteAllBytes(duongDan + ".bak", original);
        File.WriteAllText(duongDan, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }
}
