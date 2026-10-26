# ScreenGuard+

**Bảo vệ trước khi chia sẻ.** PWA tiếng Việt giúp xem trước ảnh, chọn vùng riêng tư,
che bằng màu đục và tải xuống PNG. Đồ án nhóm 08 · Phase 1 · nhánh `tuvy1`.

## Chạy trên Windows

Cần Python 3.12+ và trình duyệt hiện đại. Không cần Node để chạy ứng dụng.

```powershell
cd C:\ScreenGuardPlus_Nhom8_11TMDT
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Mở **http://127.0.0.1:8000**. Swagger: **http://127.0.0.1:8000/docs**.
Nếu đã cài dependencies vào Python hiện tại, có thể chạy `npm start` hoặc
`python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`.

Frontend không có bước build, framework, CDN, font hay API cloud. Có thể chạy riêng:

```powershell
python -m http.server 8080 --directory frontend
```

Khi đó UI chạy tại http://localhost:8080, API không được phục vụ.
Không mở `index.html` trực tiếp bằng `file://` vì ES Modules/PWA cần HTTP.

## Demo trước giảng viên

1. Từ **Tổng quan**, chọn **Thử với ảnh mẫu**.
2. Chờ tiến trình mô phỏng. Mặc định có 5 vùng thuộc 5 loại dữ liệu.
3. Bỏ chọn tất cả, chọn một vài vùng, nhấn **Che vùng đã chọn**.
4. Chuyển **Ảnh gốc / Sau khi che** rồi nhấn **Tải ảnh PNG**.
5. Trong **Dữ liệu nhạy cảm**, tắt Email và quay lại ảnh mẫu để thấy kết quả được lọc.
6. Thử ảnh riêng: upload/kéo thả hoặc Camera. Ảnh này **không được OCR**; ứng dụng
   ghi rõ chưa nhận diện và không gán các phát hiện mẫu cho ảnh.
7. Bật **Đánh dấu vùng**, kéo trên ảnh (hỗ trợ cảm ứng), hoặc nhập tọa độ pixel;
   chọn vùng rồi che/tải ảnh như trên.
8. Trong **Cài đặt & bảo vệ**, chuyển sang quét thủ công: sau khi nhập ảnh cần
   nhấn **Kiểm tra ảnh**. Mặc định là tự quét sau khi người dùng nhập ảnh.

## Có gì trong Phase 1?

| Hạng mục                                                   | Trạng thái                                          |
| ---------------------------------------------------------- | --------------------------------------------------- |
| Dashboard, điều hướng, responsive mobile/desktop           | Hoạt động                                           |
| Chọn/kéo thả PNG, JPEG, WebP; kiểm tra 10 MB / 20 MP       | Hoạt động                                           |
| Camera trực tiếp + camera thiết bị khi hỗ trợ              | Hoạt động; cần người dùng cấp quyền                 |
| Mô phỏng tiến trình và bounding boxes                      | Chỉ trên ảnh mẫu tích hợp, dữ liệu cố định          |
| Tự chọn vùng, checkbox, chọn/bỏ chọn tất cả                | Hoạt động                                           |
| Che màu đục, so sánh trước/sau, xuất PNG                   | Hoạt động                                           |
| Bật/tắt 6 loại, thêm/xóa/bật/tắt Keyword/Regex, mức rủi ro | Lưu cấu hình trên thiết bị                          |
| Keyword/Regex, độ nhạy, ngôn ngữ OCR                       | Thông số sẵn sàng tích hợp; chưa thực thi nhận diện |
| Manifest, icon 192/512, standalone, cài đặt, offline shell | Hoạt động trên trình duyệt hỗ trợ                   |
| FastAPI, validation, models, pipeline, redactor Python     | Bộ khung và contracts; redactor hoạt động           |
| Tesseract OCR, Regex/context PII detector                  | Chưa tích hợp; API trả HTTP 501                     |
| Giám sát nền                                               | Future Feature; vô hiệu hóa                         |

Không có thống kê quét giả, lịch sử ảnh, SQL, đăng nhập hoặc tự chụp màn hình.
Số loại đang bật được tính từ cấu hình thực tế. Chuyển khỏi trang quét cũng giải phóng
ảnh/kết quả trong bộ nhớ; ứng dụng không giữ lịch sử phiên quét.

## PWA, điện thoại và offline

- Nút **Cài đặt ứng dụng** gọi lời mời cài đặt khi trình duyệt phát sự kiện hỗ trợ;
  nếu chưa có, nút hiển thị hướng dẫn theo trình duyệt. Việc trình duyệt có hiện
  lời mời hay không phụ thuộc nền tảng và tiêu chí cài đặt của trình duyệt đó.
- Mở thành công một lần để service worker tải đủ app shell. Sau đó có thể tải lại,
  mở các màn hình, chạy demo và che ảnh cục bộ khi offline.
- Service worker chỉ phục vụ danh sách đường dẫn app shell cố định. Không cache
  API, URL có query, blob, ảnh tải lên, OCR text hoặc findings.
- Camera trực tiếp và service worker cần **HTTPS hoặc localhost**. Dùng địa chỉ IP
  LAN qua HTTP trên điện thoại có thể mở UI nhưng không có các tính năng này.
- Để demo UI trên cùng Wi-Fi: đổi `--host 127.0.0.1` thành `--host 0.0.0.0`, truy cập
  `http://<IP-may-tinh>:8000`; chỉ mở cổng trong mạng tin cậy. Muốn thử đầy đủ PWA/camera
  trên điện thoại, phục vụ qua HTTPS có chứng chỉ được thiết bị tin cậy.
- Khi thay đổi app shell, tăng `CACHE` trong `frontend/service-worker.js` để cập nhật
  bộ cache. Khi phát triển, có thể Unregister/Clear site data trong DevTools.

## Dữ liệu và quyền riêng tư

- Phase 1 không gửi pixels, ảnh hoặc kết quả lên API. Ảnh được decode thành Canvas
  trong RAM. Object URL được thu hồi sau khi đọc/xuất.
- Chỉ cấu hình detection/settings được lưu vào `localStorage` với khóa
  `screenguard.config.v1`. Nếu trình duyệt chặn storage, cấu hình chỉ áp dụng trong phiên.
- **Xóa ảnh**, chuyển trang hoặc tải lại sẽ bỏ ảnh và findings. Camera dừng khi đóng
  hộp thoại, chụp xong hoặc rời trang. Không xin quyền camera lúc mở ứng dụng.
- PNG xuất là pixels đã vẽ lại, không sao chép EXIF từ tệp nguồn. Vùng che là màu đục,
  không phải lớp HTML có thể bóc ra trong tệp xuất.
- Quy tắc tùy chỉnh là dữ liệu người dùng; nội dung được escape trước khi đưa vào HTML.
  Regex hiện chỉ được kiểm tra cú pháp, không thực thi trên ảnh hoặc OCR.
- **Kết quả tự động có thể bỏ sót PII. Luôn kiểm tra toàn bộ ảnh trước khi chia sẻ.**

## Cấu trúc và phân công tích hợp

```text
frontend/
  index.html, css/styles.css
  js/app.js, router.js
  js/components/       # icons, escapeHTML, toast, page helpers
  js/pages/            # dashboard, scanner, configuration, settings
  js/services/         # config, scanner contract, isolated mock fixture
  icons/, manifest.webmanifest, service-worker.js
backend/
  main.py              # FastAPI + frontend, privacy headers
  api/routes.py        # health, defaults, scan boundary
  services/scanner.py  # API ↔ core adapter
core/                  # validator, models, OCR, detector, redactor, pipeline
sample_data/README.md  # fictional fixture provenance
docs/INTEGRATION.md    # interfaces, schemas, integration checklist
tests/                 # JS contracts, Python tests, browser E2E
```

Thành viên OCR: triển khai `core/ocr.py` theo `OCRResult`, giữ xử lý local.
Thành viên PII: triển khai `core/detector.py` theo `Finding`, giữ tọa độ nguồn,
lọc theo `DetectionConfig`. Xem [hợp đồng tích hợp](docs/INTEGRATION.md).

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests/test_backend.py -q
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

E2E tự mở server tại cổng 8000 nếu chưa có; chạy từ root repository. Khi dùng venv,
đặt Python venv lên PATH hoặc kích hoạt venv trước `npm run test:e2e`. Bộ kiểm thử
bao gồm pixel của PNG đã che, upload không có kết quả giả, quy tắc chống chèn HTML,
manual mode, camera giả lập, offline/cache và bố cục mobile. Ảnh chụp kiểm tra nằm
trong `test-results/` (không đưa lên Git). Camera thật và lời mời cài đặt PWA cần
kiểm tra thêm trên thiết bị mục tiêu; camera trong E2E dùng thiết bị giả của Chromium.

Tạo lại icon: `python scripts/generate_icons.py`.

## Git

Chỉ triển khai trên `tuvy1`. Không sửa trực tiếp, merge hoặc push vào `main`.
Không commit ảnh cá nhân, `.venv`, cache hoặc kết quả kiểm thử.

Tài liệu nền tảng: [FastAPI StaticFiles](https://fastapi.tiangolo.com/tutorial/static-files/),
[MDN Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
