# ScreenGuard+ · Phase 4

PWA tiếng Việt để **OCR ảnh thật, tìm thông tin cá nhân, chọn vùng che và tải PNG**.
Workspace ảnh tối giản, hỗ trợ nền sáng/tối và giữ toàn bộ thao tác thủ công.
Windows Companion có thể tự OCR ảnh mới trong thư mục Screenshots đã cho phép,
gửi thông báo local và mở PWA để review, kể cả khi PWA đang đóng.
Khi có PII, cửa sổ cảnh báo nổi giữa màn hình và giữ đến khi đóng/mở review (hoặc
phiên hết hạn). Nút chuông trên thanh đầu mở mục **Thông báo** với các ảnh chờ.
Phát triển trên nhánh `tuvy1`; không sửa `main`.

## Chạy trên Windows

Cần Python 3.12+, Tesseract 5 và trình duyệt hiện đại. OCR chạy bằng CPU.

```powershell
cd C:\ScreenGuardPlus_Nhom8_11TMDT
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
winget install --id UB-Mannheim.TesseractOCR --exact --accept-package-agreements --accept-source-agreements
.\.venv\Scripts\python.exe scripts/install_languages.py
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Mở **http://127.0.0.1:8000**. API docs: **http://127.0.0.1:8000/docs**.
Nếu server Phase 1 vẫn đang chạy, dừng bằng Ctrl+C ở terminal đó và chạy lại lệnh
uvicorn để nạp backend Phase 2. Nếu đã cài dependencies vào Python hiện tại, có thể
chạy `npm start` hoặc `python -m uvicorn backend.main:app --port 8000 --reload`.
Không cần Node, SQL, tài khoản, cloud API hoặc GPU để chạy ứng dụng.

### Tự nhận diện screenshot — Windows

Dừng server cũ nếu đang dùng cổng 8000, cài thêm dependencies và chạy entrypoint
companion thay cho `npm start`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
.\.venv\Scripts\python.exe -m desktop_agent.main
```

Mở **http://127.0.0.1:8000/#/settings** → **Chọn thư mục** bằng hộp thoại Windows
→ bật theo dõi. Chỉ hiện **Running** khi agent thực sự hoạt động. PNG/JPEG mới sẽ
được OCR thật; có PII mới gửi thông báo số vùng. Mở thông báo để chọn vùng, che và
tải PNG. Tắt switch để dừng theo dõi; Ctrl+C dừng cả tiến trình. Không tự capture,
clipboard hoặc khởi động cùng Windows. Cấu hình đã cho phép được nhớ cho lần chạy
agent thủ công sau. [Hướng dẫn và kết quả TC01–TC10](docs/WINDOWS_COMPANION.md).
**Cảnh báo nổi trên màn hình** mặc định bật, có thể tắt riêng trong Cài đặt. Mở
review hoặc bỏ qua thông báo chỉ xóa phiên RAM, không xóa screenshot nguồn.

### Engine và gói ngôn ngữ

- Tự tìm `tesseract` trong PATH, `C:\Program Files\Tesseract-OCR` và thư mục Programs
  của người dùng. Nếu cài ở nơi khác, đặt biến môi trường trước khi chạy server:

```powershell
$env:TESSERACT_CMD = 'D:\Tools\Tesseract-OCR\tesseract.exe'
```

- `scripts/install_languages.py` tải `eng` và `vie` từ kho chính thức
  [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) vào
  `%LOCALAPPDATA%\ScreenGuardPlus\tessdata`, không cần quyền ghi vào Program Files.
- Có thể chỉ định bộ dữ liệu riêng bằng `$env:TESSDATA_PREFIX = 'D:\OCR\tessdata'`.
  Thư mục này phải chứa các tệp `.traineddata`. Trên Linux/macOS, thư mục dữ liệu
  người dùng mặc định là `~/.local/share/ScreenGuardPlus/tessdata`.
- Chọn `vie+eng`, `vie` hoặc `eng` trong Cài đặt. Nếu thiếu `vie` nhưng có `eng`,
  backend dùng `eng` và trả cảnh báo trên màn hình quét. Nếu không có ngôn ngữ
  dùng được hoặc không tìm thấy engine, báo lỗi rõ ràng và vẫn cho đánh dấu thủ công.
- Xem trạng thái thực tế tại `/api/health`, Về ScreenGuard+ và Cài đặt. Cài `pytesseract`
  bằng pip **không tự cài** Tesseract executable.

## Kiểm tra nhanh bằng ảnh thật

PWA mở trực tiếp vào **Kiểm tra ảnh**. Nút mặt trăng/mặt trời trên thanh đầu đổi
nền sáng/tối và ghi nhớ lựa chọn. Nếu chưa chọn, ứng dụng theo giao diện hệ thống.
Ba mục chính: **Kiểm tra ảnh / Quy tắc bảo vệ / Cài đặt**. Trên điện thoại, chuyển
giữa tab **Hình ảnh / Vùng cần kiểm tra**; nút che và tải ảnh luôn ở phía dưới.
Tổng quan cũ trở thành trang giới thiệu ngắn qua liên kết **Về ScreenGuard+**.

Các ảnh trong `sample_data/screenshots/` chỉ chứa dữ liệu hư cấu.

1. Mở **Kiểm tra hình ảnh**, tải `sample_data/screenshots/all.png`.
2. Ứng dụng gửi ảnh PNG đã chuẩn hóa tới Python backend cùng cấu hình hiện tại.
   Ảnh hợp lệ luôn được quét ngay khi chọn, kéo thả, chụp hoặc thay ảnh; không cần bấm quét.
3. Tesseract đọc chữ và detector tìm Email, SĐT, MSSV, CCCD, số tài khoản. Bounding
   boxes tự xuất hiện; sidebar dùng preview đã che bớt ký tự.
4. Nhấn kết quả để làm nổi bật vùng tương ứng; nhấn vùng trên ảnh hoặc checkbox để
   chọn/bỏ chọn. Nhấn **Che N vùng**, so sánh **Ảnh gốc / Sau khi che**, rồi chủ động
   nhấn **Tải ảnh đã che**. **Chỉnh lại** hoặc đổi checkbox sẽ hủy bản che cũ; cần
   che lại trước khi tải. Không có tự che hoặc tự tải sau khi quét.
5. Tắt Email trong **Quy tắc bảo vệ**, nhập lại ảnh: không trả EMAIL.
6. Thêm Regex `NV-[0-9]{6}` và Keyword `CONFIDENTIAL`, nhập ảnh `custom.png` để thử.
7. Menu **⋯** trên ảnh có **Quét lại** và **Đánh dấu thủ công**. Nhập tọa độ nằm trong
   **Nâng cao**. Nút kính lúp mở ảnh ở kích thước gốc để kiểm tra vùng nhỏ.
   Nếu scan lỗi, dùng **Thử lại** hoặc **Đánh dấu thủ công**.
   Cấu hình `manual` cũ được chuyển về auto, không còn chặn lần quét đầu tiên.

Nút **Thử với ảnh mẫu** đi qua OCR thật và cấu hình hiện tại, mặc định tìm đủ 5 loại
PII. Route cũ `#/scanner?demo` vẫn là mô phỏng Phase 1, có nhãn rõ, không gọi OCR
hoặc chạy custom rules. Không có fallback sang findings mẫu khi API lỗi.

Confidence OCR và điểm luật nằm trong phần chi tiết của từng finding. Confidence
dưới 60% có nhãn **Cần kiểm tra**; dữ liệu nhận diện không bị thay đổi để trình bày.

## Nhận diện và giới hạn

| Loại                | Luật thực tế                                                                |
| ------------------- | --------------------------------------------------------------------------- |
| Email               | Regex, hỗ trợ token bị tách quanh dấu chấm và `@`; risk HIGH                |
| SĐT Việt Nam        | Đầu số di động 03/05/07/08/09, dạng 0 hoặc +84/84; dấu cách/chấm/gạch nối   |
| MSSV                | Dạng SV + chữ số hoặc mã chữ/số có nhãn MSSV, Mã sinh viên, Student ID      |
| CCCD                | Đúng 12 số và có ngữ cảnh CCCD, Căn cước, Citizen ID                        |
| Tài khoản ngân hàng | 8–19 số và ngữ cảnh STK, Số tài khoản, Bank account, Account number         |
| Custom              | Keyword không phân biệt hoa/thường hoặc Regex giới hạn, tùy risk và enabled |

Số không có ngữ cảnh không tự bị gán thành CCCD/MSSV/tài khoản. Ngữ cảnh gần nhất
được ưu tiên, các phát hiện chồng cùng nội dung được loại trùng. Ghép token cùng
dòng giữ mapping character span → token → bounding box; vùng che mở rộng 2 pixel
và luôn nằm trong kích thước ảnh gốc. Nếu nhãn và giá trị dính trong cùng một token,
vùng có thể chứa cả token để tránh cắt sót ký tự.

**OCR confidence** là confidence do Tesseract trả về. **Điểm luật** là heuristic
của detector, không phải xác suất nhận diện chính xác. Độ nhạy Thấp/Cân bằng/Cao
lần lượt thường yêu cầu OCR confidence trung bình tối thiểu 60%/20%/0%. Riêng tài khoản
có nhãn rõ và chuỗi số hợp lệ vẫn được đề xuất ở Cân bằng/Cao khi confidence thấp;
giữ nguyên confidence thật, giảm điểm luật và hiện cảnh báo kiểm tra lại. Chế độ
Thấp vẫn lọc theo ngưỡng chặt. OCR ảnh mờ, chữ
nhỏ, tài liệu nhiều cột hoặc chữ viết tay có thể sai/bỏ sót.

**Luôn kiểm tra toàn bộ ảnh trước khi chia sẻ. Không có cam kết an toàn 100%.**
Ảnh không có findings sẽ hiển thị thông báo yêu cầu kiểm tra lại, không ghi “an toàn”.

## Quyền riêng tư và PWA

- **Ảnh được gửi tới Python backend cùng origin để OCR.** Nếu mở từ điện thoại
  trong LAN, backend có thể đang ở máy tính khác. Ứng dụng luôn mô tả là “Python
  backend”, không mặc định nhận đó là xử lý trên chính thiết bị đang mở web.
- Không gửi ảnh tới bên thứ ba; không SQL, không lưu ảnh/OCR text lâu dài, không log
  toàn bộ OCR text/PII. API chỉ trả masked previews, không trả toàn bộ văn bản OCR.
- Multipart được giới hạn và giữ trong RAM. `pytesseract` cần tệp tạm của tiến trình
  Tesseract; wrapper dọn chúng sau tác vụ, kể cả timeout thông thường. Khi vận hành
  với dữ liệu nhạy cảm, dùng thư mục TEMP riêng có quyền truy cập phù hợp; tiến trình
  bị tắt cưỡng bức có thể để lại tệp tạm của hệ điều hành.
- Ảnh ≤ 10 MiB, ≤ 20 MP; kiểm tra MIME, signature, verify/decode thực tế, chuẩn hóa
  EXIF, matte trắng cho ảnh trong suốt. PNG xuất được vẽ mới, không sao chép EXIF.
- Upload giới hạn 2 tác vụ OCR đồng thời; companion thêm một worker riêng.
  Mỗi engine call tối đa 25 giây, tối đa 20.000 token,
  100.000 ký tự OCR và 500 findings. UI hủy yêu cầu khi thay ảnh/rời trang; tác vụ
  Tesseract đã bắt đầu vẫn chịu timeout của backend.
- Custom: tối đa 30 quy tắc, tên 60 ký tự, pattern 200 ký tự, 12 nhóm/nhánh,
  20 toán tử lặp, bound ≤ 1000. Không lookaround/backreference/recursion/inline flags.
  Engine `regex` có timeout 50 ms/rule và ngân sách tổng 500 ms. Lỗi rule được báo
  rõ, không dùng `eval`, không thực thi regex tùy ý đồng bộ trên frontend.
- Chỉ lưu detection/settings và lựa chọn giao diện trong localStorage. **Xóa ảnh**, đổi trang hoặc reload
  giải phóng ảnh/kết quả trên UI. Camera chỉ mở khi người dùng chọn và dừng khi đóng.
- Giữ nguyên manifest, standalone, icon 192/512, luồng cài đặt và offline shell.
  Service worker v8 dùng bản mới từ server khi online, fallback allowlist tĩnh khi
  offline; không cache API, ảnh hoặc PII.
  Offline vẫn dùng UI/demo/đánh dấu/che/tải PNG; **OCR thật cần kết nối backend**.
- Service worker và camera cần HTTPS hoặc localhost. Companion cố định loopback;
  không expose cổng qua LAN hoặc proxy. Chỉ PWA upload thông thường có thể dùng
  HTTPS riêng trên thiết bị khác, không có quyền điều khiển companion Windows.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

E2E khởi động server riêng tại **8012**, không tái sử dụng server cũ tại cổng 8000.
Có thể đặt `$env:SCREENGUARD_TEST_PORT = '8013'` nếu cần. Khi dùng venv, kích hoạt
venv hoặc đặt Python venv lên PATH trước khi gọi npm/Playwright.

Unit tests dùng token tổng hợp để kiểm tra mapping/luật. **Integration tests thực sự
chạy Tesseract trên ảnh PNG/JPEG** và browser gọi API thật, kiểm tra cả pixel ảnh
xuất. Nếu không có engine/ngôn ngữ, các integration tests liên quan được đánh dấu
skip với lý do, không giả OCR để báo pass. Tóm tắt TC01–TC13 ở [VALIDATION](docs/VALIDATION.md).
Ảnh kiểm tra giao diện nằm trong `test-results/`, không commit.

Tạo lại ảnh hư cấu: `python sample_data/generate_samples.py` (cần Arial/DejaVu Sans).
Tạo lại icon: `python scripts/generate_icons.py`.

## Cấu trúc

- `frontend/js/services/scanner-service.js`: multipart client, validation findings,
  adapter cho Canvas; mock nằm riêng trong `mock-scanner.js`.
- `backend/api/`: health, validation, giới hạn multipart, scan worker.
- `core/ocr.py`: Tesseract, EXIF/RGB, token/line/span mapping, language fallback.
- `core/detector.py`, `core/rules.py`: luật PII, context, dedup, Regex có timeout.
- `core/models.py`, `core/pipeline.py`: contracts và ghép pipeline thực tế.
- `core/redactor.py`: redactor Python tùy chọn; UI tiếp tục dùng Canvas đã kiểm thử.

Xem [hợp đồng tích hợp](docs/INTEGRATION.md). Tham khảo chính thức:
[pytesseract](https://github.com/madmaze/pytesseract),
[Tesseract installation](https://tesseract-ocr.github.io/tessdoc/Installation.html),
[regex timeout](https://pypi.org/project/regex/),
[FastAPI multipart](https://fastapi.tiangolo.com/tutorial/request-forms-and-files/).
