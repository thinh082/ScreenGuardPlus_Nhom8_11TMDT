# Hợp đồng tích hợp · Phase 1

## Frontend ES Modules

### `validateImage(file: File): true`

`frontend/js/services/scanner-service.js`. Kiểm tra MIME PNG/JPEG/WebP, tệp không rỗng,
≤ 10 MB. `decodeImage(file)` decode bytes, kiểm tra ≤ 20 MP và trả Canvas. File bị
hỏng hoặc MIME không hỗ trợ ném `Error`. SVG không được nhận. Canvas dùng ảnh theo
hướng hiển thị trình duyệt (đã áp dụng EXIF orientation).

### `scanImage(image: HTMLCanvasElement, config, options?): Promise<ScanResult>`

```js
const result = await scanImage(canvas, getDetectionConfig(), {
  signal: abortController.signal,
  onProgress: (percent) => {},
  // fixtureId chỉ được gán bởi nút demo, tuyệt đối không suy từ tên file upload.
});
```

```js
{
  status: 'unavailable', // Phase 1 uploads; future provider: 'complete'
  source: 'none',       // future provider: 'ocr'
  width: 960, height: 640,
  findings: [],
  message: 'OCR thực tế chưa tích hợp…'
}
```

Mock trả `status: 'demo', source: 'mock'` và nằm riêng trong `mock-scanner.js`.
Chỉ `DEMO_ID` của fixture tích hợp được phép chạy mock. Với ảnh bất kỳ, không trả
findings mẫu, không ghi “an toàn” hoặc “không phát hiện PII” khi OCR chưa chạy.
Tiến trình trên UI hiện là mô phỏng, không phải đo tiến độ Tesseract.

Mẫu finding (tọa độ pixel, gốc trên trái):

```json
{
  "id": "unique-id",
  "type": "email",
  "label": "Địa chỉ email",
  "text": "fictional@example.com",
  "risk": "medium",
  "box": { "x": 280, "y": 216, "width": 426, "height": 42 }
}
```

Type: `email | phone | cccd | student | bank | custom | manual`.
Risk: `low | medium | high`. Mọi box phải nằm trong ảnh gốc. Không quy đổi về
tọa độ CSS trước khi trả kết quả. Renderer tự scale để hiển thị.

### `redactImage(image: CanvasImageSource, selectedFindings): HTMLCanvasElement`

Canvas mới, màu đục `#111827`, giữ kích thước gốc. Chỉ gọi với findings đã chọn.
Sau khi thay đổi selection, UI vô hiệu hóa ảnh xuất cũ và yêu cầu che lại. Before
hiển thị bounding boxes; After và PNG chỉ chứa pixels đã che, không có lớp highlight.

### `getDetectionConfig()` / `updateDetectionConfig(config)`

`config-service.js` trả bản sao, không cho caller thay đổi state ngầm.
`updateDetectionConfig` validate và trả `{ config, persisted }`; `persisted: false`
nghĩa là storage bị chặn và chỉ lưu trong RAM.

```json
{
  "types": {
    "email": true,
    "phone": true,
    "cccd": true,
    "student": true,
    "bank": true,
    "custom": true
  },
  "rules": [
    {
      "id": "uuid",
      "name": "Mã nhân viên",
      "kind": "regex",
      "pattern": "NV-[0-9]{6}",
      "risk": "medium",
      "enabled": true
    }
  ],
  "mode": "auto",
  "sensitivity": "balanced",
  "language": "vie+eng"
}
```

Mode: `auto | manual`, sensitivity: `low | balanced | high`, language:
`vie | eng | vie+eng`. Tối đa 30 quy tắc, tên ≤ 60, pattern ≤ 200 ký tự.
Custom bật/tắt là master switch: detector tương lai chỉ dùng quy tắc enabled nếu
`types.custom === true`. Trình mô phỏng hiện chỉ lọc 5 loại fixture, không thực thi
custom rule, độ nhạy hay ngôn ngữ. Regex JS và Python khác nhau; cần thống nhất cú
pháp khi tích hợp, không giả định mọi biểu thức JS đều được Python hỗ trợ.

## Python core

| Hàm                                         | Input → output                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `validate_image(image, content_type=None)`  | bytes → `(width, height)`; raises `ImageValidationError`                          |
| `extract_text(image, language)`             | bytes → `OCRResult`; hiện raises `OCRUnavailableError`                            |
| `detect_sensitive_text(ocr_result, rules)`  | `OCRResult, DetectionConfig` → `list[Finding]`; hiện raises `NotImplementedError` |
| `redact_image(image, selected_findings)`    | bytes, list → PNG bytes, không ghi file                                           |
| `run_pipeline(image, config, content_type)` | validate → OCR → detection → `ScanResult`                                         |

Models ở `core/models.py`. `OCRResult` có `width`, `height`, `language`, `blocks`;
mỗi block có `text`, `box`, `confidence` trong [0,1]. Chuẩn hóa EXIF orientation
trước OCR và trả kích thước theo ảnh đã xoay; backend redactor cũng dùng hướng này.
Production Python `ScanResult` chỉ cho `source='ocr', status='complete'`, không nhận mock.

## API hiện tại

- `GET /api/health`: trạng thái app, `ocr` và `pii` là `not_implemented`.
- `GET /api/config`: cấu hình mặc định, không phải cấu hình riêng của người dùng.
- `POST /api/scan`: raw image bytes, header `Content-Type: image/png | image/jpeg |
image/webp`. Validate format, MIME thực tế, kích thước. 415: sai MIME; 413: >10 MB;
  422: bytes hỏng hoặc >20 MP. Ảnh hợp lệ hiện nhận 501:

```json
{
  "detail": {
    "code": "OCR_NOT_IMPLEMENTED",
    "message": "Real OCR is not integrated in Phase 1. Use the built-in browser demo or mark regions manually."
  }
}
```

Không có server config/session, authentication hoặc storage. Chưa có API ghi cấu hình
hoặc upload lưu file. Frontend Phase 1 **không gọi `/api/scan`**.

Khi nối backend thật, mở rộng hợp đồng request để truyền DetectionConfig (ví dụ multipart
image + JSON config đã validate), cập nhật OpenAPI, rồi thay nhánh unavailable trong
`scanner-service.js` bằng adapter API. Hiển thị rõ cho người dùng trước khi thay đổi
cam kết xử lý tại thiết bị. Không âm thầm chuyển ảnh sang dịch vụ cloud.

## Điều kiện trước khi nối OCR/PII

- Tesseract cài local với traineddata `vie` và `eng`; xử lý ngoài event loop server.
- Giữ dữ liệu ảnh/OCR trong RAM, không log PII; không ghi file tạm nếu không cần.
- Validate lại findings từ provider, giới hạn số lượng và kiểm tra box nằm trong ảnh.
- Regex tùy chỉnh cần worker/process hoặc engine có timeout để chặn catastrophic
  backtracking; không chạy regex tùy ý đồng bộ trên UI/event loop.
- Respect enabled types/rules, language và sensitivity, định nghĩa rõ ngưỡng thực tế.
- Giữ cảnh báo có thể bỏ sót PII; giữ cách đánh dấu thủ công và review trước xuất.
- Mở rộng kiểm thử fixtures tiếng Việt có dấu, EXIF, ảnh mờ, false positive/negative.
- Không thêm endpoint chứa ảnh/PII vào service-worker allowlist; API luôn `no-store`.
