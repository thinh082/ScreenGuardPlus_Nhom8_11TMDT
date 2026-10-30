# Phase 5 — OCR secrets và Windows Companion

`core/secrets_detector.py` chạy sau bộ PII trong `core/pipeline.py`. API PWA và
Windows watcher dùng cùng pipeline, không dùng findings cố định theo ảnh demo.

## Nhận diện

- `DB_CREDENTIAL`: `DATABASE_PASSWORD`, biến mật khẩu cấu hình, URI PostgreSQL,
  MySQL, MongoDB, Redis và password trong connection string SQL Server.
- `API_KEY`: GitHub PAT, Google API key, AWS access/secret key, Bearer token,
  biến API key/token và client/application secret. AWS access key ID là HIGH;
  secret key và credential là CRITICAL.
- `JWT_TOKEN`: chuỗi ba phần giống JWT, CRITICAL. Đây là nhận diện để review,
  không xác minh chữ ký hoặc kiểm tra token còn hiệu lực.
- `PRIVATE_KEY`: header PEM/OpenSSH và các dòng trong khối private key.
- `INTERNAL_IP`: mạng riêng/hostname nội bộ, LOW, chỉ trong profile `security`.

Secrets bật mặc định ở cả `personal` và `security`, kể cả cấu hình agent cũ chưa có
trường profile. Các công tắc ở **Quy tắc bảo vệ → Secrets** áp dụng cho lần quét
tiếp theo; cấu hình được chuyển sang agent khi kết nối. PII và các lựa chọn cũ được giữ.

Regex chịu được khoảng trắng do OCR thêm vào, nhãn JSON có dấu nháy và một số
nhầm ký tự thường gặp. Không suy ra một ảnh là an toàn khi không tìm thấy dữ liệu.
Ảnh chữ nhỏ, mờ, xuống dòng giữa credential hoặc ký tự OCR đọc sai vẫn có thể bị bỏ sót.
Độ tin cậy OCR thật được giữ; vùng credential đọc kém được đánh dấu cần kiểm tra.

## Review và tải ảnh

- Secrets CRITICAL phải che trước khi xuất bằng API ở cả hai profile.
- Profile `personal` giữ khả năng chọn/bỏ chọn PII; thông tin chưa che cần xác nhận
  rõ ràng khi tải. Profile `security` bắt buộc che CCCD/STK khi chọn công khai;
  chia sẻ nội bộ cho phép xác nhận cảnh báo PII.
- Server lấy findings từ scan ticket, kiểm tra toàn bộ hợp các vùng che, không
  cộng trùng diện tích. Không chấp nhận bỏ hở mép hoặc tọa độ ngoài ảnh.
- Redactor server dùng màu đục; kiểm tra toàn bộ pixel của finding đã che, tạo PNG
  mới không mang metadata gốc. Header `X-Image-Hash` là SHA-256 của PNG xuất;
  hash không chứng minh OCR tìm đủ mọi thông tin.
- Ticket là capability ngẫu nhiên, chỉ gửi trong JSON; ảnh và dữ liệu nhạy cảm
  không vào URL. Ticket nằm trong RAM tối đa 10 phút, 50 mục/64 MiB; timer xóa cả
  khi không có request mới. Không ghi ảnh/OCR/PII vào log hoặc lịch sử trên đĩa.

## Test luồng Windows

```powershell
python -m pip install -r requirements-dev.txt
python -m desktop_agent.main
```

Mở http://127.0.0.1:8000/#/settings, chọn thư mục Screenshots và bật theo dõi.
Chỉ coi hoạt động khi **Running**; bật **Cảnh báo nổi trên màn hình** nếu muốn
cửa sổ cảnh báo giữ đến khi đóng/mở review. Nút chuông PWA chứa các phiên chờ.
Agent kiểm tra observer, worker và thư mục còn tồn tại trước khi báo Running.
Lỗi quét và lỗi gửi thông báo được báo riêng; thông báo Windows thất bại vẫn giữ
phiên review trong nút chuông.

1. Mở một tài liệu thử chứa `DATABASE_PASSWORD=DemoPass123!` (giá trị giả).
2. Win+PrtScn để file mới thực sự lưu vào thư mục đã chọn. Đóng PWA cũng thử được.
3. Chờ ghi file xong và OCR; mở cảnh báo → review đúng ảnh → chọn vùng → che → tải PNG.
4. Chụp/copy lại cùng nội dung: không thông báo lặp trong cùng phiên watcher.
5. Tắt theo dõi: Stopped, ảnh mới không được quét nền.

**Win+Shift+S/PrtScn chỉ đưa ảnh vào clipboard sẽ không kích hoạt tính năng này**
nếu Windows không lưu file vào thư mục theo dõi. MVP không đọc clipboard, không
tự chụp màn hình, không tự che/chia sẻ, không tự khởi động cùng Windows.

## Kiểm thử tự động

```powershell
python -m pytest -q
npm test
npm run test:e2e
```

`tests/test_secrets_integration.py` tạo ảnh chữ thật bằng Pillow, chạy Tesseract,
kiểm tra password/connection string/API/token/JWT/private key, giữ EMAIL, công tắc
loại dữ liệu, rồi tạo file mới qua Watchdog để kiểm tra cảnh báo, chống trùng và tắt.
E2E kiểm tra profile mặc định, chặn export thiếu vùng bắt buộc, review từ agent khi
đóng PWA và gọi `/api/export` bằng đúng ticket. Recorder trong E2E chỉ thay kênh
notification; không thay OCR/detector/watcher.

Kết quả chạy và giới hạn xác minh desktop được ghi trong [VALIDATION](VALIDATION.md).
