# Windows Screenshot Companion — Phase 4

Agent là **tiến trình Python local thực sự**, dùng Watchdog để nhận sự kiện file
Windows rồi gọi `core.pipeline.run_pipeline`. Browser không cần mở để quét và gửi
thông báo. Không có capture liên tục, clipboard, cloud, SQL hoặc thay đổi OCR/PII.

## Chạy trên Windows 10/11

Giữ nguyên Tesseract và bộ `eng`/`vie` đã cài ở Phase 2. Dùng tài khoản Windows
bình thường, không cần Administrator.

```powershell
cd C:\ScreenGuardPlus_Nhom8_11TMDT
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
.\.venv\Scripts\python.exe -m desktop_agent.main
```

Nếu đang chạy `npm start`/uvicorn ở cổng 8000, dừng server đó bằng Ctrl+C trước.
Entrypoint companion khởi chạy **chính FastAPI/PWA hiện có** cùng agent trong một
tiến trình, không cần chạy thêm backend. Không dùng `--reload` hoặc nhiều workers.
Nếu dùng Python hệ thống đã cài dependencies thì chạy `python -m desktop_agent.main`.
PWA đã mở từ phase trước cần tải lại để nhận app shell v7 sau khi service worker
cập nhật; không tự tải lại lúc người dùng đang chỉnh ảnh.

1. Mở `http://127.0.0.1:8000/#/settings`.
2. Trong **Tự nhận diện screenshot — Windows**, bấm **Kiểm tra kết nối**.
3. Bấm **Chọn thư mục** và chọn thư mục mà Windows thực sự lưu screenshots.
   Hộp thoại native Windows là bước cho phép; PWA không được gửi đường dẫn tùy ý.
4. Bật theo dõi. Chỉ hiện **Running** khi observer, emitter và worker còn hoạt động.
5. Dùng Win+PrtScn; file phải được lưu vào đúng thư mục đã chọn. Không theo dõi thư
   mục con và không quét ảnh cũ lúc bật. Snipping Tool chỉ được quét khi nó lưu file
   vào thư mục đó, không phải khi ảnh chỉ nằm trong clipboard.
6. Khi có PII, Windows nhận thông báo số vùng. Mở thông báo để vào review, xem boxes,
   chọn/bỏ chọn, **Che N vùng** rồi chủ động **Tải ảnh đã che**. Không tự che/tải/chia sẻ.

Tắt switch sẽ dừng observer, bỏ hàng chờ và xóa các phiên review trong RAM. Tác vụ
Tesseract đã bắt đầu có thể chạy đến timeout core 25 giây, nhưng không thể gửi kết
quả/thông báo sau khi tắt. **Ctrl+C** ở terminal dừng toàn bộ agent/backend.

Chương trình không thêm startup task, Run key hoặc Windows service. Thư mục, trạng
thái bật/tắt và cấu hình được nhớ ở `%LOCALAPPDATA%\ScreenGuardPlus\companion.json`;
nếu đã cho phép trước đó, lần **tự chạy lệnh agent** sau sẽ tiếp tục theo lựa chọn đó.
Registry HKCU chỉ có danh tính thông báo `ScreenGuardPlus.Companion`, không có ảnh,
PII, secret hoặc lệnh tự khởi động.

CLI cho phép chỉ định rõ thư mục đã cấp quyền, hữu ích khi chạy thử:

```powershell
python -m desktop_agent.main --port 8015 --folder "C:\Screenshots-Allowed" --enable
```

Thư mục phải tồn tại. Không chấp nhận root ổ đĩa, home, UNC, symlink/junction; file
symlink hoặc trỏ ra ngoài thư mục cũng bị từ chối. Không tự thay thư mục screenshot
của Windows. `--settings-file` có thể dùng để tách riêng consent/config khi kiểm thử.

## Xử lý và quyền riêng tư

- Watchdog dùng `recursive=False`, nhận create/move và cập nhật file mới. Debounce
  0,8 giây; trên Windows mở với share-read để tránh file còn writer. Retry tối đa
  15 giây cho file chưa hoàn chỉnh/corrupt, không làm chết observer.
- Dùng validator hiện tại: signature/MIME, tối đa 10 MiB và 20 MP. PNG/JPG/JPEG;
  ảnh quá giới hạn bị từ chối trước OCR. Chuẩn hóa EXIF/alpha sang PNG trong RAM,
  bỏ metadata để tọa độ OCR và ảnh review khớp nhau.
- Một worker OCR, tối đa 64 file chờ, 512 hash gần nhất để chống nội dung trùng;
  không thêm thread OCR cho từng sự kiện. Không đọc/quét lại ảnh cũ lúc khởi động.
  Khi quá tải, `dropped` trong status tăng; hãy nhập ảnh cần kiểm tra bằng PWA.
- Cấu hình detector/language/sensitivity và custom rules được đồng bộ từ PWA lúc mở
  và khi đổi cấu hình. Agent dùng snapshot tại thời điểm bắt đầu mỗi ảnh. Khi PWA
  đóng, dùng cấu hình đồng bộ gần nhất. Lỗi cập nhật agent được báo trên PWA.
- Chỉ ảnh có findings mới tạo phiên review và gửi toast. Ảnh sạch không có cảnh báo
  PII, cũng không được tuyên bố an toàn tuyệt đối.
- Review giữ tối đa **8 ảnh / 64 MiB / 10 phút**, dọn mỗi giây. Phiên được xóa sau
  khi PWA nhận review, khi tắt agent hoặc khi hết hạn/bị eviction. Không có lịch sử
  ảnh/OCR trên disk. File screenshot nguồn do Windows/người dùng tạo vẫn ở thư mục
  gốc; agent không sửa/xóa file đó.
- Core `pytesseract` vẫn dùng tệp TEMP của hệ điều hành trong lúc OCR và dọn sau tác
  vụ như trước. Không tạo history riêng; kết thúc tiến trình cưỡng bức có thể để lại
  tệp TEMP. Dùng TEMP có quyền truy cập phù hợp khi xử lý dữ liệu nhạy cảm.
- URL chỉ có ID ngẫu nhiên 256-bit trong fragment, không có filename, folder, OCR
  text hoặc PII. Preview findings vẫn được mask. Toast chỉ có số lượng và lời nhắc.
- API nội bộ chỉ nhận loopback với Host hợp lệ; kiểm tra Origin và Fetch Metadata,
  cookie HttpOnly/SameSite Strict cùng CSRF header. Không mở CORS. Tất cả API
  `no-store`, service worker chỉ cache allowlist shell v7.
- Entrypoint bind cố định `127.0.0.1`, tắt proxy headers và access log; không ghi
  exception, tên file, OCR text hoặc PII vào log. Không expose port qua LAN/proxy.
  Cơ chế này chống request web/network trái phép; không bảo vệ khỏi malware chạy
  dưới chính tài khoản Windows của người dùng.

## Trạng thái và lỗi

- Backend thường (`npm start`) vẫn phục vụ upload/manual OCR, nhưng status agent là
  **Stopped**, `available=false`; PWA không tự khởi chạy Python.
- `notification=submitted` nghĩa là Windows đã nhận yêu cầu, không chứng minh banner
  đã xuất hiện: quyền thông báo/Do Not Disturb có thể ẩn nó. `failed` được báo ở UI.
- Nếu thông báo hết hạn hoặc RAM đã bị xóa, PWA báo phiên hết hạn; có thể nhập file
  nguồn lại. Link thông báo mở trình duyệt mặc định/PWA theo cấu hình Windows.
- Nếu backend không kết nối, UI không giữ nhãn Running vô thời hạn: kiểm tra mỗi
  5 giây khi đang ở Settings. Không có native tray hoặc autostart trong MVP.

## Xác minh

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest tests -q
npm test
npm run test:e2e
```

`tests/test_desktop_agent.py` dùng Watchdog trên filesystem Windows và Tesseract
thật; không thay kết quả OCR bằng findings cố định. `tests/support/desktop_server.py`
là harness E2E riêng: OCR/watch/API thật, chỉ recorder thông báo được thay để kiểm
tra deterministic số vùng và URL. Không có test endpoint trong production.

| TC               | Chứng cứ                                                                                               | Trạng thái                          |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| TC01 Win+PrtScn  | Watchdog nhận file Windows thật đã qua; phím và thư mục screenshot Windows chưa thao tác trực tiếp     | Chưa xác minh phím                  |
| TC02 Email       | File mới → core OCR thật → EMAIL, preview mask                                                         | Đạt                                 |
| TC03 Nhiều PII   | all.png → 5 loại, recorder kiểm tra số 5; WinRT native toast kiểm tra riêng                            | Đạt tự động + native smoke          |
| TC04 Click toast | XML WinRT có activationType protocol và URL ID local; mở đúng URL → đúng ảnh/boxes, không gọi lại scan | Chưa click trực tiếp trên Windows   |
| TC05 Che/tải     | Chọn/bỏ chọn và PNG opaque, kiểm tra pixel trung tâm cả 5 bbox                                         | Đạt                                 |
| TC06 Tắt agent   | Observer dừng, file mới không được quét; OCR trễ không được publish                                    | Đạt                                 |
| TC07 Không PII   | clean.png quét thật, không tạo cảnh báo                                                                | Đạt                                 |
| TC08 File lỗi    | Writer còn mở, file từng phần, corrupt, sai signature, quá kích thước                                  | Đạt                                 |
| TC09 Trùng       | Hai file cùng bytes chỉ có một thông báo                                                               | Đạt                                 |
| TC10 PWA đóng    | Đóng tất cả tab → file mới → thông báo → mở review ở tab mới                                           | Đạt với recorder; WinRT đã gửi thật |

Native smoke trên máy này: companion riêng tại cổng 8015, thư mục test được chỉ
định rõ, OCR email thật; Windows notification history có một toast, activation
protocol và URL review local đúng, không chứa email raw. Đã tắt agent và dọn toast
sau thử nghiệm. Công cụ Computer Use báo `native pipe is unavailable`, nên không
coi TC01/phần click vật lý TC04 là đã pass. Hộp chọn thư mục native cũng cần thử
trực tiếp; E2E dùng picker xác định trước trong harness.

Ảnh QA: `test-results/phase4-agent-running.png`, `phase4-agent-stopped.png` và
`phase4-desktop-review.png`. Chỉ có dữ liệu hư cấu, không commit ảnh kiểm thử.

Tham chiếu triển khai:
[Watchdog](https://watchdog.readthedocs.io/en/stable/quickstart.html),
[Windows-Toasts protocol activation](https://windows-toasts.readthedocs.io/en/latest/advanced_usage.html#open-a-website-on-click),
[custom AUMID](https://windows-toasts.readthedocs.io/en/latest/custom_aumid.html).
