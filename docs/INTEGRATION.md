# Hợp đồng tích hợp · Phase 2

## API

### `GET /api/health`

```json
{
  "status": "ok",
  "backend_available": true,
  "phase": 2,
  "tesseract_installed": true,
  "languages": ["eng", "vie"],
  "ocr_available": true,
  "detector_available": true,
  "stores_images": false,
  "processing": "python_backend"
}
```

Các giá trị OCR/languages là trạng thái thực tế của máy chạy backend, không hardcode.
Không trả đường dẫn cài engine hoặc dữ liệu người dùng.

### `POST /api/scan`

Multipart gồm đúng **một `image`** và **một `config`**:

```js
const form = new FormData();
form.append("image", pngBlob, "scan.png");
form.append("config", JSON.stringify(getDetectionConfig()));
const response = await fetch("./api/scan", {
  method: "POST",
  body: form,
  signal,
  cache: "no-store",
});
```

`image`: PNG/JPEG/WebP ≤ 10 MiB, ≤ 20 MP. Đuôi file không được tin; MIME phải khớp
bytes thực tế. Frontend hiện gửi PNG được vẽ từ Canvas đã áp EXIF để tọa độ khớp.
`config`: JSON ≤ 64 KiB theo `DetectionConfig`, giữ cấu trúc Phase 1:

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
      "name": "Staff",
      "kind": "regex",
      "pattern": "NV-[0-9]{6}",
      "risk": "high",
      "enabled": true
    }
  ],
  "mode": "auto",
  "sensitivity": "balanced",
  "language": "vie+eng"
}
```

`mode`: auto/manual điều khiển thời điểm UI gọi API. `language`: vie/eng/vie+eng;
thiếu vie sẽ dùng eng khi có và trả warnings. `sensitivity`: low/balanced/high là
ngưỡng OCR confidence trung bình tối thiểu .60/.20/0, không phải điểm xác suất.
`types.custom` là master switch; từng rule cũng phải enabled. Không lưu cấu hình tại server.

Response minh họa schema (giá trị thực tế do OCR/detector tạo):

```json
{
  "mode": "real_ocr",
  "width": 1500,
  "height": 550,
  "language": "vie+eng",
  "findings": [
    {
      "id": "generated-uuid",
      "type": "EMAIL",
      "label": "Địa chỉ email",
      "bbox": [439, 50, 959, 87],
      "risk": "HIGH",
      "score": 0.95,
      "ocr_confidence": 0.9,
      "preview": "te***@example.com",
      "source": "ocr_regex"
    }
  ],
  "warnings": [],
  "message": "Đã nhận diện văn bản. Kết quả tự động có thể bỏ sót thông tin; vui lòng kiểm tra lại ảnh trước khi chia sẻ."
}
```

- `bbox = [left, top, right, bottom]`, pixel trên ảnh đã áp EXIF, cạnh phải/dưới exclusive.
- API types: EMAIL, PHONE, CITIZEN_ID, STUDENT_ID, BANK_ACCOUNT, CUSTOM.
- Risk: LOW/MEDIUM/HIGH. `source`: ocr_regex/ocr_keyword.
- `ocr_confidence` lấy từ Tesseract, trung bình theo số ký tự các token liên quan.
- `score` là heuristic luật phát hiện, không phải xác suất thống kê.
- Không trả raw OCR text hoặc raw PII; `preview` đã che bớt ký tự. Nội dung đầy đủ
  chỉ tồn tại tạm trong pipeline Python.
- 413: vượt giới hạn; 415: sai media type; 422: ảnh/config/rule không hợp lệ hoặc
  Regex vượt timeout; 503: engine/ngôn ngữ chưa sẵn sàng hoặc worker bận; 504: OCR
  thất bại/quá 25 giây. Lỗi có `detail` là chuỗi hoặc `{code, message}`, không chứa stack trace.
- Mọi API response có `Cache-Control: no-store`. Cấu hình/ảnh/PII không được thêm
  vào service worker cache.

### `GET /api/config` và `POST /api/config/validate`

GET trả defaults. POST nhận JSON DetectionConfig để kiểm tra schema/Regex và trả
`{"valid":true}`. Không lưu trên server. Frontend xác thực khi thêm rule; nếu backend
không kết nối, có thể lưu cấu hình cục bộ đã kiểm tra cú pháp để xác thực lại lúc scan.
Tối đa 30 rules, tên 60, pattern 200 ký tự; không lookaround, recursion, backreference
hoặc inline flags. Giới hạn 12 nhóm, 12 nhánh, 20 toán tử lặp, bound ≤ 1000.
Khi chạy: timeout 50 ms/rule, tổng 500 ms, tối đa 500 findings.

## Python

- `validate_image(bytes, content_type=None)` → kích thước ảnh lưu trước áp EXIF.
- `extract_text(bytes, language)` → `OCRResult(width,height,language,text,blocks,lines,warnings)`.
  Kích thước/tọa độ theo ảnh hiển thị sau EXIF; không resize. Mỗi OCRBlock có text,
  box x/y/width/height, confidence 0..1 và line_id page/block/paragraph/line của Tesseract.
- `build_lines(blocks)` → text của từng dòng và TokenSpan(start,end,token_index).
  Detector tìm character spans trên dòng và lấy union các token giao với span.
  Không dùng tọa độ của riêng token đầu hoặc che toàn dòng. Mở rộng 2 px và clamp vào ảnh.
- `detect_sensitive_text(ocr_result, config)` → `list[Finding]` nội bộ với type/risk
  chữ thường và raw text tạm thời. `run_pipeline` chuyển sang `APIFinding` masked.
- `run_pipeline(bytes, config, content_type)` → `ScanResult` thực, không import mock.
- `redact_image(bytes, selected_findings)` giữ API Phase 1, xuất PNG đục không EXIF.

OCR/detector chạy trong threadpool, giới hạn 2 worker slots, không chặn event loop.
Multipart giữ trong RAM dưới giới hạn request. Pytesseract dùng temporary files để
nói chuyện với Tesseract CLI và dọn sau tác vụ; không có persistent upload directory.
Không log text hoặc bytes; không chuyển lỗi gốc Tesseract chứa đường dẫn ra người dùng.

## JavaScript và tương thích Canvas

`validateImage(file)` và `decodeImage(file)` giữ API Phase 1.

`scanImage(canvas, config, {signal, onProgress, fixtureId})`:

- Không có fixtureId: encode PNG, POST cùng origin, validate response (kích thước,
  type/risk, ID, bbox trong ảnh, score/confidence), đổi API types sang chữ thường
  và bbox sang `{x,y,width,height}`. Trả `status:'complete', source:'ocr'`.
- Dữ liệu sidebar dùng masked preview qua escapeHTML; không inject OCR text.
- `onProgress(null,label)` cho giai đoạn không đo được phần trăm; không mô phỏng
  phần trăm Tesseract. Hoàn tất trả 100. Timeout mạng 35 giây, signal được chuyển tiếp.
- fixtureId chỉ do nút demo gán: mock giữ riêng, không gửi ảnh tới API, không dùng cho upload.
- Lỗi ném Error, không trả kết quả giả/empty như một lần OCR thành công. UI hiển thị
  lỗi và mở lại công cụ đánh dấu thủ công. Không có findings chỉ được báo khi scan thành công.
- Findings thủ công được giữ khi quét lại cùng ảnh, ghép với kết quả tự động mới.
  Đổi selection làm vô hiệu hóa PNG cũ; cần che lại trước khi tải.

`redactImage(canvas, findings)` → Canvas mới tô đục #111827, nguyên kích thước.
Không thay thuật toán che Phase 1. `getDetectionConfig`/`updateDetectionConfig` vẫn
lưu riêng trên thiết bị và trả bản sao. Hủy fetch/rời trang không đồng nghĩa dừng
ngay Tesseract đã bắt đầu; server sẽ dọn theo timeout giới hạn.

## Điều còn có thể cải thiện

PSM 6 phù hợp khối văn bản tương đối thẳng hàng; cần đánh giá thêm tài liệu nhiều cột,
chữ nhỏ/mờ, handwritten và OCR trên nền phức tạp. Luật SĐT hiện hỗ trợ số di động VN;
CCCD/MSSV/STK là pattern + context, không xác minh danh tính hoặc tài khoản có thật.
Không suy diễn kết quả heuristic thành bảo đảm ảnh an toàn.
