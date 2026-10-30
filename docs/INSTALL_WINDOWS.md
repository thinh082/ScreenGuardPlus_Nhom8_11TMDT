# Hướng Dẫn Cài Đặt & Phân Phối ScreenGuard+ Trên Windows

Tài liệu này hướng dẫn cách đóng gói, cài đặt và vận hành hệ thống **ScreenGuard+** trên các máy tính Windows 10 và Windows 11 độc lập, không yêu cầu người dùng cuối phải thao tác bằng dòng lệnh (terminal/PowerShell).

---

## 1. Các Gói Phân Phối Được Hỗ Trợ

Hệ thống ScreenGuard+ cung cấp 2 hình thức triển khai cho Windows:

| Gói phân phối | Đường dẫn | Đặc điểm | Đối tượng sử dụng |
| :--- | :--- | :--- | :--- |
| **Windows Setup Installer** | `dist/ScreenGuardPlus-Setup.exe` (~96 MB) | Trình cài đặt đồ họa Inno Setup tiêu chuẩn, tự động tạo shortcut Start Menu, Desktop, hỗ trợ gỡ cài đặt sạch qua Control Panel/Settings. | Người dùng cuối, máy tính người dùng doanh nghiệp. |
| **Portable Distribution** | `dist/ScreenGuardPlus/` (~377 MB) | Thư mục ứng dụng độc lập chứa đầy đủ Python Runtime, thư viện, Tesseract OCR 5.4.0 (eng/vie), chỉ cần chạy `ScreenGuardPlus.exe`. | Dùng ngay từ USB/ổ cứng di động, môi trường kiểm thử QA, máy không có quyền Administrator. |

---

## 2. Yêu Cầu Hệ Thống & Thành Phần Đóng Gói

### Cấu hình tối thiểu:
- **Hệ điều hành:** Windows 10 (bản 1809 trở lên) hoặc Windows 11 (64-bit).
- **RAM:** Tối thiểu 2 GB (khuyến nghị 4 GB trở lên).
- **CPU:** Kiến trúc x86_64 hỗ trợ tập lệnh AVX/SSE (hầu hết CPU từ 2012 trở lại).
- **Trình duyệt Web:** Edge, Chrome, Brave, Firefox hoặc bất kỳ trình duyệt hiện đại nào.

### Thành phần đi kèm trong gói:
1. **Python 3.12 Runtime**: Tự chứa (bundled by PyInstaller), không cần cài Python trên máy đích.
2. **FastAPI & Uvicorn Backend**: Cung cấp API quét, chính sách DLP và xuất ảnh bảo mật.
3. **Frontend PWA (HTML/CSS/JavaScript)**: Giao diện web hoàn chỉnh, tự động mở khi chạy ứng dụng.
4. **Desktop Screenshot Agent**: Module giám sát ảnh chụp màn hình Windows với WinRT Toast Notifications & Popup.
5. **Tesseract OCR v5.4.0 Portable**: Đi kèm đầy đủ các thư viện DLL (libtesseract, libleptonica, openjp2...) và dữ liệu ngôn ngữ `eng.traineddata`, `vie.traineddata`.
6. **Launcher & Supervisor**: Điều khiển tiến trình, kiểm tra cổng 8000, ràng buộc loopback `127.0.0.1` tuyệt đối.

---

## 3. Hướng Dẫn Cài Đặt Bằng `ScreenGuardPlus-Setup.exe`

### Bước 1: Chạy file cài đặt
Nhấp đúp chuột vào file `ScreenGuardPlus-Setup.exe`.
- Nếu có hộp thoại *User Account Control (UAC)*, chọn **Yes**.
- Trình cài đặt hỗ trợ cài đặt ở chế độ Người dùng hiện tại (*Current User*) hoặc Toàn bộ hệ thống (*All Users*).

### Bước 2: Thiết lập cấu hình cài đặt
- Chọn thư mục cài đặt (mặc định: `C:\Program Files\ScreenGuardPlus` hoặc `%LOCALAPPDATA%\Programs\ScreenGuardPlus`).
- Đánh dấu chọn **Create a desktop shortcut** nếu muốn tạo biểu tượng trên màn hình chính.
- Bấm **Install** để tiến hành giải nén và thiết lập ứng dụng.

### Bước 3: Hoàn tất
- Bấm **Finish** để khởi chạy ScreenGuard+.
- Ứng dụng sẽ tự động mở trang chủ `http://127.0.0.1:8000` trên trình duyệt mặc định.

---

## 4. Hướng Dẫn Sử Dụng Bản Portable (Không Cần Cài Đặt)

1. Giải nén hoặc sao chép thư mục `dist/ScreenGuardPlus` vào bất kỳ vị trí nào trên máy (ví dụ: `D:\Apps\ScreenGuardPlus`).
2. Nhấp đúp chuột vào file **`ScreenGuardPlus.exe`**.
3. Cửa sổ điều khiển quản lý ứng dụng sẽ hiển thị:
   - Đèn xanh trạng thái: `● Máy chủ đang chạy: http://127.0.0.1:8000`.
   - Trạng thái OCR: `● Tesseract OCR: Sẵn sàng (eng, vie)`.
   - Nút **[ Mở giao diện Web ]**: Mở nhanh tab trình duyệt mới.
   - Nút **[ Thư mục cấu hình ]**: Mở nhanh `%LOCALAPPDATA%\ScreenGuardPlus`.
   - Nút **[ Dừng & Thoát ]**: Dừng máy chủ và toàn bộ tiến trình con an toàn.

---

## 5. Cơ Chế Hoạt Động Của Launcher & Bảo Mật

Trình quản lý `launcher.py` / `ScreenGuardPlus.exe` tuân thủ nghiêm ngặt các nguyên tắc bảo mật thông tin:
1. **Ràng buộc Loopback (127.0.0.1):**
   Chỉ lắng nghe duy nhất trên `127.0.0.1`, tuyệt đối không bind trên `0.0.0.0` hay mở cổng ra mạng LAN/Internet.
2. **Chống trùng lặp Instance & Tránh xung đột cổng:**
   Trước khi kích hoạt máy chủ, Launcher kiểm tra cổng 8000:
   - Nếu ScreenGuard+ đã đang chạy: Mở ngay tab trình duyệt tới phiên đang chạy và thoát nhẹ nhàng, tránh nhân bản tiến trình.
   - Nếu cổng bị chiếm bởi phần mềm khác: Hiển thị hộp thoại cảnh báo rõ ràng và cho phép chỉ định cổng khác qua cờ `--port <số_cổng>`.
3. **Quyền riêng tư Screenshot:**
   Không tự ý bật tính năng theo dõi ảnh chụp màn hình khi người dùng chưa đồng ý cấp quyền trong mục *Cài đặt*.
4. **Lưu trữ dữ liệu chuẩn Windows:**
   Toàn bộ cấu hình và dữ liệu tạm thời được lưu tại `%LOCALAPPDATA%\ScreenGuardPlus`, không bao giờ ghi đè vào thư mục cài đặt `Program Files`.
5. **Dừng tiến trình sạch sẽ (Clean Teardown):**
   Khi người dùng đóng cửa sổ điều khiển hoặc nhấn *Dừng & Thoát*, Launcher sẽ gửi tín hiệu hủy đến Uvicorn server, dừng Watchdog file system observer và dọn dẹp popup cảnh báo, không để lại tiến trình chạy ngầm vô thừa nhận.

---

## 6. Hướng Dẫn Gỡ Cài Đặt (Uninstall)

Khi không còn nhu cầu sử dụng, bạn có thể gỡ bỏ hoàn toàn ScreenGuard+:
1. Vào **Start Menu** → tìm `ScreenGuard+` → chọn **Uninstall ScreenGuard+**.  
   *(Hoặc vào Windows Settings → Apps → Installed apps → tìm ScreenGuard+ → Uninstall).*
2. Trong quá trình gỡ cài đặt, trình gỡ cài đặt sẽ hỏi:
   > *"Bạn có muốn xóa dữ liệu cấu hình và cache cá nhân tại %LOCALAPPDATA%\ScreenGuardPlus không?"*
   - Chọn **Yes** để dọn sạch toàn bộ dữ liệu cấu hình.
   - Chọn **No** nếu muốn lưu lại cấu hình để sử dụng tiếp trong tương lai.

---

## 7. Biên Dịch Gói Cài Đặt Từ Mã Nguồn (Dành Cho Nhà Phát Triển)

Để tự đóng gói lại bản cài đặt từ mã nguồn:

```powershell
# Chạy script build tự động
python scripts\build_windows.py

# Hoặc dùng file batch tiện ích
.\scripts\build_installer.bat
```

Các tham số nâng cao của script:
- `--clean`: Dọn sạch thư mục `build/` và `dist/` trước khi build.
- `--skip-pyinstaller`: Bỏ qua bước đóng gói PyInstaller nếu đã có sẵn thư mục portable.
- `--skip-installer`: Chỉ tạo thư mục portable, không gọi Inno Setup.
- `--no-tesseract`: Không copy bộ Tesseract portable (dành cho bản cài đặt siêu nhẹ dựa vào Tesseract cài sẵn trên máy).

