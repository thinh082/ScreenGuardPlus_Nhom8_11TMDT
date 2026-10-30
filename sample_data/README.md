# Ảnh mẫu

## Phase 2 — kiểm thử OCR thật

`screenshots/*.png` do `generate_samples.py` vẽ bằng Pillow từ các giá trị hư cấu.
`expected.json` chứa giá trị/khung chữ ground truth để so sánh, không phải output
OCR. Pipeline và integration tests thực sự gọi Tesseract trên các ảnh này.

Các bộ ảnh gồm Email, SĐT, MSSV, CCCD, STK, tất cả 5 loại, ảnh sạch, custom,
token bị tách và nhãn tiếng Việt. Tạo lại bằng `python sample_data/generate_samples.py`
(Arial hoặc DejaVu Sans). Không dùng thông tin cá nhân thật.

Phase 2.5: `bank.png`/`all.png` dùng nhãn Account number. Bổ sung `bank_vietnamese.png`
(Tài khoản ngân hàng), `bank_tight.png` (giá trị sát nhãn) và `bank_difficult.png`
(chữ nhỏ hơn, xám và hơi mờ). Generator tự chừa khoảng cách theo chiều rộng nhãn;
chỉ fixture tight cố ý đặt sát. Ảnh tight trên Tesseract đã kiểm thử đọc đúng số nhưng
confidence thấp; detector đề xuất kèm cảnh báo khi có context, không thay OCR bằng mock.

## Phase 1 — demo mô phỏng được giữ riêng

Fixture cố định được vẽ bằng Canvas trong `frontend/js/services/mock-scanner.js`.
Kích thước: 960 × 640. Toàn bộ nhân vật và giá trị đều hư cấu.

`DEMO_ID` chỉ được truyền khi người dùng bấm **Ảnh mẫu demo**. Upload/camera không
được gán ID này, kể cả khi tên tệp giống ảnh mẫu. Danh sách `SAMPLE_FINDINGS` dùng
tọa độ pixel khớp chính xác với nội dung được vẽ. Cấu hình chỉ lọc theo loại;
Keyword/Regex và độ nhạy không chạy trên mock; chúng áp dụng cho OCR thật của Phase 2.

Không đưa dữ liệu cá nhân thật vào thư mục này hoặc Git.
