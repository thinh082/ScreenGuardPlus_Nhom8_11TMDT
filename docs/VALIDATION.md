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
