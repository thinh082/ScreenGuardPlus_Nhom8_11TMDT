using System.Data.Common;
using System.Security.Cryptography;
using System.Text;

namespace BaoMatChung;

public static class BaoMat
{
    public static string ChuanHoa(string chuoi)
    {
        var b = new DbConnectionStringBuilder { ConnectionString = chuoi };
        string lay(params string[] ten) { foreach (var t in ten) if (b.TryGetValue(t, out var v)) return Convert.ToString(v) ?? ""; return ""; }
        var server = lay("server", "data source", "address", "addr").Trim().ToLowerInvariant();
        if (server.StartsWith("tcp:")) server = server[4..].Trim();
        var db = lay("database", "initial catalog").Trim().ToLowerInvariant();
        var user = lay("user id", "uid", "user", "username").Trim().ToLowerInvariant();
        var password = lay("password", "pwd");
        if (server.Length == 0 || db.Length == 0 || user.Length == 0 || password.Length == 0) throw new ArgumentException("Chuoi ket noi phai co server, database, user va password.");
        return $"{server}|{db}|{user}|{password}";
    }
    public static byte[] Khoa(string chuoi) => SHA256.HashData(Encoding.UTF8.GetBytes(ChuanHoa(chuoi)));
    public static byte[] ChuKy(byte[] khoa, string ma, string gio) => HMACSHA256.HashData(khoa, Encoding.UTF8.GetBytes(ma + "|" + gio));
    private static byte[] KhoaPhu(byte[] khoa, string nhan) => SHA256.HashData(khoa.Concat(Encoding.UTF8.GetBytes(nhan)).ToArray());
    public static string MaHoa(byte[] khoa, string ma, string gio, string chuoi)
    {
        using var aes = Aes.Create();
        aes.Key = KhoaPhu(khoa, "|ENC"); aes.GenerateIV();
        using var encryptor = aes.CreateEncryptor();
        var plain = Encoding.UTF8.GetBytes(chuoi);
        var ciphertext = encryptor.TransformFinalBlock(plain, 0, plain.Length);
        var mac = HMACSHA256.HashData(KhoaPhu(khoa, "|MAC"), Encoding.UTF8.GetBytes(ma + "|" + gio).Concat(aes.IV).Concat(ciphertext).ToArray());
        return Convert.ToBase64String(aes.IV.Concat(ciphertext).Concat(mac).ToArray());
    }
    public static string GiaiMa(byte[] khoa, string ma, string gio, string duLieu)
    {
        var data = Convert.FromBase64String(duLieu);
        if (data.Length < 64 || (data.Length - 48) % 16 != 0) throw new CryptographicException("Du lieu khong hop le.");
        var iv = data[..16]; var ciphertext = data[16..^32]; var mac = data[^32..];
        var expected = HMACSHA256.HashData(KhoaPhu(khoa, "|MAC"), Encoding.UTF8.GetBytes(ma + "|" + gio).Concat(iv).Concat(ciphertext).ToArray());
        if (!CryptographicOperations.FixedTimeEquals(mac, expected)) throw new CryptographicException("MAC khong hop le.");
        using var aes = Aes.Create(); aes.Key = KhoaPhu(khoa, "|ENC"); aes.IV = iv;
        using var decryptor = aes.CreateDecryptor();
        return Encoding.UTF8.GetString(decryptor.TransformFinalBlock(ciphertext, 0, ciphertext.Length));
    }
}
public record YeuCau(string? MaDoiTac, string? Gio, string? ChuKy);
public record PhanHoi(int StatusCode, string? Message = null, string? DuLieu = null);
