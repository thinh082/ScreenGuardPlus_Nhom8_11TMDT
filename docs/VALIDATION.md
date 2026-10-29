# Xác minh Phase 2

Đã chạy trên Windows, Python 3.12, Tesseract 5.4.0, bộ `eng`/`vie` từ tessdata_fast.
Ảnh nguồn hoàn toàn hư cấu. Các bài OCR integration gọi engine thật, không thay
`image_to_data` hoặc `extract_text` bằng kết quả cố định.

| TC                | Chứng cứ kiểm thử                                                                                                   | Kết quả |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| TC01 Email        | OCR `email.png`, kiểm tra EMAIL + vị trí/preview                                                                    | Đạt     |
| TC02 SĐT          | OCR `phone.png`, unit cho +84/0/cách/chấm/gạch nối                                                                  | Đạt     |
| TC03 MSSV         | OCR `student.png`, unit cho dạng SV và context                                                                      | Đạt     |
| TC04 CCCD         | OCR `citizen.png`, chỉ nhận 12 số có context                                                                        | Đạt     |
| TC05 STK          | OCR `bank.png`, context ưu tiên hơn mẫu SĐT/CCCD                                                                    | Đạt     |
| TC06 Cả 5 loại    | OCR `all.png`, đủ 5 loại không trùng; browser tự hiện boxes                                                         | Đạt     |
| TC07 Không PII    | OCR `clean.png`, không có findings; UI yêu cầu review                                                               | Đạt     |
| TC08 Tắt Email    | API thực + browser không trả EMAIL                                                                                  | Đạt     |
| TC09 Custom       | OCR `custom.png` chạy Keyword/Regex; unit bật/tắt/timeout                                                           | Đạt     |
| TC10 Che vùng     | Browser upload → API thật → thêm manual → rescan → PNG; kiểm tra pixels vùng che và nhãn không bị che               | Đạt     |
| TC11 Giả PNG      | Bytes không phải ảnh, dù tên/MIME PNG, bị từ chối                                                                   | Đạt     |
| TC12 Hỏng/quá lớn | PNG bị cắt, >10 MiB, >20 MP, sai signature/MIME bị từ chối                                                          | Đạt     |
| TC13 OCR không có | Backend dùng đường dẫn engine không tồn tại trả 503; browser kiểm tra fallback thủ công bằng lỗi 503 được kiểm soát | Đạt     |

Kiểm tra thêm: OCR tiếng Việt; fallback thực sang eng với thư mục chỉ có eng và
đường dẫn có dấu cách; EXIF orientation; OCR timeout thực; token email/SĐT bị tách;
mapping vùng che không chứa nhãn bên cạnh; context gần nhất; Regex DoS timeout;
không echo config lỗi/PII; API no-store; camera và hủy tác vụ khi rời trang;
demo Phase 1, install help, mobile, offline shell không cache API/PII.

Lệnh xác minh:

```powershell
python -m pytest tests -q
npm test
npm run test:e2e
```

49 bài Python, 6 bài JavaScript, 15 bài trình duyệt. Integration tests tự skip kèm
lý do ở máy thiếu Tesseract/ngôn ngữ, không tính skip thành pass. Khi xác minh trên
máy này có đủ eng/vie và không có bài bị skip.

Kiểm thử không chứng minh OCR/PII có độ chính xác tuyệt đối trên mọi ảnh. Camera
thật và lời mời cài PWA tùy thiết bị; camera trong E2E dùng thiết bị giả của Chromium.
E2E dùng cổng riêng 8012 để tránh chạy nhầm backend Phase 1 còn mở ở cổng 8000.

## Bổ sung giao diện gọn và sáng/tối

Thêm 3 bài UI: vào trình quét ngay khi mở PWA; đổi sáng/tối, lưu qua reload và đổi
trang; các thao tác chính nằm trong khung nhìn ở desktop/điện thoại; tab ảnh/kết quả
và nút xuất cố định; không tràn ngang trên điện thoại nhỏ/tablet. Tổng bộ E2E hiện có
18 bài, gồm cả các bài OCR/PNG/camera/offline trước đó. Ảnh QA sáng/tối của các màn
hình được tạo trong `test-results/ui-*.png` và không commit.

## Phase 2.5 — Auto scan và ngữ cảnh tài khoản

- **61 Python + 6 JavaScript + 22 Playwright = 89 kiểm thử đạt**, không có bài skip
  trên môi trường có Tesseract eng/vie này. Các bài OCR chạy engine thật trên ảnh hư cấu.
- Upload, kéo thả và camera gọi API đúng một lần khi nhận ảnh hợp lệ. Cấu hình manual
  cũ được chuyển sang auto. Quét lại chỉ ở menu ảnh; busy chặn gọi trùng.
- Kiểm thử giữ response OCR thật của ảnh cũ, cố ý bỏ qua AbortSignal và trả trễ sau
  khi đã đổi ảnh: UI vẫn giữ kết quả ảnh mới. Không tự che hoặc tải ảnh sau scan.
- Danh sách → highlight ảnh; click bbox → đổi checkbox; focus bàn phím được giữ khi
  render lại. PNG so sánh pixel xác nhận tài khoản bị bỏ chọn giữ nguyên nội dung.
- Lỗi 503 có Retry và Manual Mask hoạt động; quét lại giữ vùng thủ công.
- Mẫu all.png dùng Account number: engine thật trả đủ Email, Phone, Student ID,
  Citizen ID và Bank Account. Thêm ảnh tiếng Việt, sát nhãn và chữ nhỏ/xám/hơi mờ.
- Trên ảnh sát nhãn, Tesseract đọc đúng chuỗi nhưng confidence chỉ 3% trên máy này.
  Ngưỡng mặc định trước đây loại vùng đó. Nay ngữ cảnh tài khoản rõ cho phép đề xuất
  ở Cân bằng/Cao, giữ nguyên confidence, giảm score và hiện warning; Low vẫn lọc chặt.

File chính: `frontend/js/pages/scanner.js`, `frontend/js/components/scanner-view.js`,
`frontend/js/services/scanner-service.js`, `config-service.js`, CSS scanner; setting
chỉ sửa phần mode liên quan auto. Detector/pipeline, generator và ảnh mẫu, unit và
integration tests có regression tương ứng. Service worker v4 giữ allowlist app shell.

Giới hạn: không có ảnh gốc bị bỏ sót ngoài repo để đối chiếu; kết quả được xác minh
trên bộ ảnh hư cấu kèm dự án. OCR mờ hoặc sai ký tự vẫn có thể bỏ sót. Nếu label và số
cùng một token, box có thể chứa cả label để tránh che sót. Hủy fetch bỏ kết quả cũ
trên UI; tác vụ Tesseract đã khởi chạy vẫn chịu timeout backend, không dừng ngay.
Không có theo dõi nền, thư mục toàn hệ thống hoặc ứng dụng khác.
