# ScreenGuard+ — Quy trình bảo vệ 5 bước

Nhánh: `feature/workflow-ui`, tạo từ `origin/tuvy1` tại `d1db102`.
Worktree: `C:\ScreenGuardPlus_WorkflowUI`. Ngày kiểm tra: 30/10/2026.

## Giao diện và cách chạy

```powershell
cd C:\ScreenGuardPlus_WorkflowUI
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8050
```

Mở http://127.0.0.1:8050. Nếu preview này đang chạy thì chỉ mở URL, không chạy thêm
process cùng cổng. Backend thường không chạy Windows watcher; Settings hiển thị
Stopped khi không có companion. Để thử companion ở worktree riêng:

```powershell
New-Item -ItemType Directory -Force tmp | Out-Null
python -m desktop_agent.main --port 8056 --settings-file .\tmp\workflow-companion.json
```

Mở http://127.0.0.1:8056, chọn thư mục được phép bằng Settings và bật theo dõi.
File cấu hình này tách khỏi consent/settings của bản demo/Installer đang làm.
Không tự bật theo dõi hoặc tái dùng thư mục ảnh cá nhân trong kiểm thử UI.

Thiết kế nền `#F7F5EF`, navy/teal, sidebar số 01–05 và phần Công cụ riêng.
Giữ chế độ tối hiện có. Mobile dùng nút menu và bộ chọn bước, đồng thời giữ hai tab
Hình ảnh / Vùng cần kiểm tra để tránh ép ảnh và danh sách vào cùng màn hình nhỏ.
Nút Quay lại / Tiếp luôn thuộc cùng scanner session.

Đã tham khảo sidebar, `showPage`, page metadata, request guards và Next/Previous
trong `web/index.html`, `web/app.js`, `web/styles.css`, `FLOW_DEMO.md` của
[SOC SHIFT](https://github.com/tuvyyy/SOC_SHIFT_TH3_11TMDT_NHOM8/tree/ff7968c).
ScreenGuard+ giữ canvas/PII/policy riêng và không sao chép giao diện SOC SHIFT.

## Năm bước

1. **Tiếp nhận ảnh:** chọn file, camera, ảnh mẫu qua OCR thật, mở ảnh đang chờ từ
   Companion; chọn Personal/IT-DevOps. Khi nhận ảnh sẽ tự OCR và mở bước 02 để theo
   dõi tiến độ. Có thể quay lại 01 xem tên/trạng thái hoặc chủ động đổi ảnh.
2. **Phát hiện rủi ro:** ảnh và bounding boxes, preview đã mask, type/risk, confidence
   OCR và chi tiết vùng. Nhận diện xong mới đánh dấu bước quét hoàn tất; không đánh
   dấu ảnh không có finding là “an toàn tuyệt đối”.
3. **Đánh giá chính sách:** chọn Công khai/Nội bộ và các vùng dự định che. Gọi
   `POST /api/policy/evaluate` bằng ticket thật; hiển thị BLOCK/WARN/ALLOW, lý do
   tiếng Việt và số vùng chưa được bao phủ. Đây là **kế hoạch che, chưa áp dụng**.
   Bỏ chọn một secret bắt buộc có thể làm kế hoạch BLOCK. ALLOW của kế hoạch không
   có nghĩa ảnh gốc đã được che.
4. **Che thông tin:** giữ canvas mapping, checkbox, vẽ vùng tay, nhập tọa độ và so
   sánh ảnh gốc/sau che. Chỉ nút Che thực hiện redaction. Với ảnh không có finding,
   nút Chuẩn bị PNG tạo preview theo lựa chọn chủ động của người dùng.
5. **Kiểm chứng & xuất:** đánh giá lại **ảnh thực tế đã che**, dùng vùng che đã áp
   dụng hoặc danh sách rỗng nếu chưa che. Tải qua Secure Export API; BLOCK/403 không
   tạo download, WARN/400 cần xác nhận rõ ràng, thành công mới hiển thị SHA-256 đầy đủ.

Sidebar thể hiện “đã hoàn thành” theo bằng chứng: đã nhận ảnh, OCR thực hoàn tất,
đã nhận quyết định backend, đã tạo redacted preview, đã có kết quả secure export.
Hoàn thành bước đánh giá có nghĩa đã đánh giá, không đồng nghĩa quyết định ALLOW.

## State và lỗi

- `original`, `findings`, `selected`, `scanTicket`, `redacted` vẫn ở một closure
  `scannerPage`; chuyển bước chỉ đổi panel hiển thị. Không OCR lại, không thay
  checkbox/destination/profile và không tải ảnh khi chỉ chuyển bước.
- Ảnh, OCR text và findings không được ghi localStorage. Config/theme tiếp tục
  dùng cơ chế có sẵn. Rời hẳn scanner sang Công cụ hoặc reload vẫn kết thúc phiên
  scanner như trước; phạm vi bảo toàn là năm bước trong cùng phiên.
- Chỉ thao tác explicit (đổi ảnh/quét lại/chọn vùng/đổi profile) mới thay đổi dữ
  liệu liên quan. Chọn vùng khác làm preview xuất/hash cũ mất hiệu lực.
- Policy request có serial/abort guard, không cho phản hồi cũ ghi đè vùng chọn
  mới. Chuyển vào 03/05 đánh giá lại; khi focus hoặc mỗi phút ở các bước này kiểm
  tra lại trạng thái. Không dùng timer frontend để giả quyết định backend.
- Ticket hết hạn: hướng dẫn Quét lại ảnh, vô hiệu hóa tải, giữ ảnh/vùng chọn hiện
  có. Chỉ khi người dùng bấm Quét lại ảnh mới chạy OCR và nhận ticket mới.
- Lỗi kết nối không hiển thị ALLOW cũ. Khi export đang chạy không cho đổi checkbox
  hoặc cấu hình; kết quả của ảnh đã bị thay thế không được tải vào phiên mới.
- Cơ chế đánh dấu/che thủ công khi OCR unavailable và fixture mô phỏng legacy
  vẫn được giữ cho tương thích. Không có ticket thì không tuyên bố policy/secure
  verification thành công. Nút ảnh mẫu trong UI sử dụng OCR thật, không gọi fixture.

Không thay đổi `core/`, `backend/`, `desktop_agent/`, Policy Engine, Secrets Detector,
Secure Export service hoặc Windows Installer. Nhánh này không chứa bản sửa false
positive ở `qa/pre-demo-validation`, và không tự merge vào `tuvy1`/`main`.

## Kiểm thử

```powershell
npm ci
npm test
$env:SCREENGUARD_TEST_PORT = '8053'
$env:SCREENGUARD_AGENT_TEST_PORT = '8052'
npm run test:e2e
python -m pytest -q
```

| Bộ kiểm thử | Kết quả |
|---|---|
| JavaScript unit | 8 passed |
| Playwright, toàn bộ tests cũ + workflow | 40 passed |
| Python regression, Tesseract thật | 124 passed |

Test cũ được cập nhật để điều hướng tới bước có thao tác tương ứng; vẫn giữ các
assertions về số vùng, pixel, API, config, camera, offline, review Companion và
download. Không bỏ test hoặc biến lỗi thành skip để làm giao diện mới pass.

`tests/e2e/workflow.spec.js` xác minh:

- Sidebar 5 bước, active/completion hợp lý, keyboard Enter và `aria-current=step`.
- Giữ đúng ảnh, findings, checkbox và ticket khi đi qua lại các bước; chỉ 1 OCR
  request. Mẫu thật chứa password/API key giả, API chỉ trả preview đã mask.
- BLOCK thật từ Policy API khi bỏ chọn secret; export thiếu secret thật trả 403
  và 0 downloads. Sau che đủ, ALLOW thật, PNG và SHA-256 khớp byte tải xuống.
- WARN thật cần confirm; dismiss không tải ảnh, accept mới cho phép xuất.
- Ticket INVALID_TICKET được mô phỏng ở ranh giới HTTP để kiểm tra presentation
  hết hạn; sau bấm Quét lại dùng OCR/API thật để tạo phiên mới. Backend TTL và
  enforcement vẫn được kiểm tra trong bộ Python hiện có.
- Phản hồi policy cũ bị giữ lại rồi trả trễ không thay thế quyết định mới.
- Ảnh sạch, chuẩn bị PNG có chủ đích và xuất qua API thật.
- Mobile/tablet không tràn ngang, nút điều hướng trong viewport; screenshot desktop
  và các bài responsive cũ kiểm tra sáng/tối, phone 320px và workspace laptop.
- Không có `pageerror` trong luồng chính. Những console HTTP 400/403 dự kiến là
  kết quả kiểm thử chính sách, không phải JavaScript exception.

Windows Companion E2E dùng Watchdog/OCR/API thật với thư mục thử và recorder
notification; giữ đúng review session, không gọi OCR lại từ PWA. Không báo là đã
bấm Win+PrtScn hoặc click toast vật lý trong nhiệm vụ UI.

## Ảnh giao diện

Chỉ chứa dữ liệu giả, chụp từ Playwright sau khi chạy thật:

| Bước | Screenshot |
|---|---|
| 01 Tiếp nhận | [workflow-01-intake.png](ui/workflow-01-intake.png) |
| 02 Phát hiện | [workflow-02-detection.png](ui/workflow-02-detection.png) |
| 03 Policy BLOCK | [workflow-03-policy-block.png](ui/workflow-03-policy-block.png) |
| 04 Sau che | [workflow-04-redaction.png](ui/workflow-04-redaction.png) |
| 05 PNG/hash | [workflow-05-export.png](ui/workflow-05-export.png) |
| Mobile | [workflow-mobile-390.png](ui/workflow-mobile-390.png) |
| Tablet | [workflow-mobile-834.png](ui/workflow-mobile-834.png) |

Ảnh gốc kết quả test nằm trong `test-results/`, có thể bị Playwright xóa ở lượt
chạy sau. Các ảnh bàn giao được sao chép vào `docs/ui/`.

## Demo ngắn

1. 01: chọn ảnh thử có password/email giả, hoặc bấm Thử với ảnh mẫu. Nói: “Ảnh được
   OCR local, mọi phát hiện cần kiểm tra lại.”
2. 02: chỉ bounding box, loại dữ liệu, confidence và preview mask. Đi 01 rồi quay
   lại 02 để thấy ảnh và lựa chọn vẫn giữ, không tạo OCR request mới.
3. 03: chọn Công khai, bỏ chọn secret bắt buộc; chỉ BLOCK và lý do tiếng Việt.
   Nói: “Đây là đánh giá kế hoạch, ảnh gốc chưa được thay đổi.”
4. 04: chỉ che những vùng đã chọn, qua 05 thử tải để thấy backend BLOCK thật. Quay
   lại 04, chọn secret, che lại và so sánh Ảnh gốc / Sau khi che.
5. 05: chỉ ALLOW của ảnh đã che, bấm tải PNG, đối chiếu SHA-256. Nói: “Hash xác minh
   file xuất; OCR vẫn có thể bỏ sót, nên không cam kết ảnh an toàn 100%.”

Nếu WARN thì review và xác nhận; nếu ticket hết hạn dùng Quét lại ảnh. Nếu backend
không kết nối, kiểm tra đúng cổng/process, không giả ALLOW hoặc bỏ qua Secure Export.
