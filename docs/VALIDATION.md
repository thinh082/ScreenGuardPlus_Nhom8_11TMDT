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

## Phase 3 — Minimal Privacy Workspace

Kết quả cuối trên môi trường này: **61 Python + 6 JavaScript + 26 Playwright =
93 kiểm thử đạt; 0 fail, 0 skip**. `prettier --check` và `git diff --check` đạt.
Các bài OCR thật dùng Tesseract eng/vie; kiểm tra PNG so sánh pixel vùng che và vùng
không được chọn. Bốn bài workspace mới cùng toàn bộ 22 bài hồi quy đều đạt.

Giữ nguyên FastAPI, OCR, detector, API contract và persistence. Chỉ thay giao diện,
luồng review và thêm cửa sổ xem ảnh kích thước gốc.

- Ba mục chính: Kiểm tra ảnh, Quy tắc bảo vệ, Cài đặt. Route Tổng quan cũ vẫn chạy,
  dưới dạng giới thiệu ngắn qua liên kết Về ScreenGuard+.
- Workspace desktop chia ảnh/kết quả 2:1; mobile có tab và hành động cố định phía
  dưới. Nội dung chính vừa khung 1366×768, 1920×1080 và điện thoại 320/390px.
- Nền dark `#11161f`, surface `#191f2b`, accent `#86d8be`; nền light `#f5f6f8`,
  surface trắng, accent `#087b65`. Chữ chính 14–16px, tiêu đề 24–28px, phụ 12–14px.
  Màu chữ phụ được kiểm tra tương phản tối thiểu 4.5:1 trên các nền sử dụng.
- Trạng thái quét chỉ có spinner và “Đang kiểm tra ảnh...”; không có phần trăm giả.
  Confidence/điểm luật nằm trong details, không sửa dữ liệu trả về. OCR dưới 60%
  có nhãn Cần kiểm tra. Test giao diện nhãn này dùng response kiểm soát; không dùng
  nó để đánh giá độ chính xác OCR.
- Nút ảnh mẫu nay gọi API OCR thật, nhận đủ 5 loại với cấu hình mặc định. Chỉ route
  legacy `#/scanner?demo` dùng fixture mô phỏng, vẫn có nhãn rõ.
- Sau khi che, primary là Tải ảnh đã che, secondary Chỉnh lại. Chỉnh lại hoặc đổi
  checkbox vô hiệu hóa ảnh xuất cũ; không tự download. Focus chuyển đến hành động
  tiếp theo, thông báo vùng được cập nhật cho screen reader.
- Inspector dùng pixel/tọa độ gốc, click vùng đồng bộ checkbox; Escape đóng và trả
  focus về nút mở. Canvas inspector được giải phóng khi đóng/rời trang.
- Năm detector là năm dòng cấu hình; custom master riêng với số quy tắc thực tế.
  Cài đặt dùng ba nhóm dòng, trạng thái OCR nằm trong phần chi tiết.

File thay đổi:

- `frontend/css/styles.css`, `frontend/js/app.js`,
  `frontend/js/components/{icons,scanner-view}.js`: tokens, app frame, ba mục điều
  hướng, responsive.
- `frontend/js/pages/{scanner,configuration,dashboard,settings}.js`: workspace,
  trạng thái export, inspector, cấu hình dòng và onboarding.
- `frontend/js/theme-init.js`, `frontend/js/services/theme-service.js`,
  `frontend/index.html`, `frontend/manifest.webmanifest`,
  `frontend/service-worker.js`: đồng bộ màu PWA, cache shell v5.
- `tests/e2e/{app,real-ocr,ui,workspace}.spec.js`: giữ kiểm thử chức năng, cập nhật
  selector/copy theo UI mới và thêm bốn kiểm thử workspace.
- `README.md`, tài liệu này: hướng dẫn luồng sử dụng và chứng cứ xác minh.

Ảnh QA được tạo bởi Playwright, trong `test-results/` (không commit):

- `phase3-workspace-{1366,1920}-{light,dark}.png`: workspace trước khi che.
- `phase3-after-dark.png`: tải ảnh và chỉnh lại sau che.
- `ui-desktop-{light,dark}.png`, `ui-configuration-{light,dark}.png`,
  `ui-settings-{light,dark}.png`, `ui-overview-{light,dark}.png`: các màn hình chính.
- `ui-mobile-preview.png`, `ui-mobile-findings.png`, `ui-mobile-dark.png`,
  `phase3-loaded-{320,834}.png`: điện thoại/tablet và primary actions.
- `phase3-image-detail.png`, `phase3-loading.png`: inspector và loading.

Chưa triển khai thêm giám sát nền (ngoài phạm vi Phase 3). Camera trong E2E là
camera giả lập; chưa xác minh lời mời cài PWA và camera vật lý trên điện thoại.

## Phase 4 — Windows Screenshot Companion

Triển khai tiến trình Python local thật, Watchdog trên thư mục được cho phép,
Tesseract/core detector thật, WinRT toast, RAM review và Settings Running/Stopped.
Backend và PWA cũ vẫn hoạt động khi không có companion. Không có findings demo
được dùng cho screenshot của agent.

- Bộ hồi quy: **70 Python + 6 JavaScript + 28 Playwright = 104 bài đạt, 0 fail,
  0 skip**. Trong đó có 9 bài agent
  mới và 2 bài E2E agent. Các bài có điều kiện OCR không skip trên máy eng/vie này.
- Python xác minh create/move/partial/corrupt/dedup/stop và JPEG EXIF bằng Watchdog
  Windows + Tesseract thật. Kiểm tra loopback/Origin/Host/cookie/CSRF, 410 sau xóa,
  TTL/eviction, folder confinement và config/consent không chứa lịch sử ảnh.
- E2E đóng toàn bộ tab PWA trước khi tạo ảnh mới, sau đó mở đúng review URL nhận
  từ recorder thông báo. Không gọi lại `/api/scan`; che/chọn/tải kiểm tra pixel cả
  5 vùng. Tắt Bank trong PWA được áp dụng sang lần quét agent tiếp theo.
- Native WinRT smoke riêng đã gửi thật và được tìm thấy trong notification history:
  activation protocol, URL review local opaque, không chứa raw email. Không tính
  recorder E2E thành chứng cứ banner/click Windows thực tế.
- Bố cục Settings khi Running/Stopped và review được chụp trong
  `test-results/phase4-{agent-running,agent-stopped,desktop-review}.png`.

**Chưa xác minh trực tiếp**: Win+PrtScn, chọn folder trong dialog native và click
thông báo Windows, vì Computer Use native pipe không khả dụng. Toàn bộ pipeline
file mới → OCR → toast native đã được xác minh độc lập; thao tác phần cứng/desktop
không được báo là pass. [Ma trận TC01–TC10 và cách chạy](WINDOWS_COMPANION.md).

## Sửa PWA giữ giao diện cũ sau Phase 4

Server 8000 đã chạy companion và trả về Settings mới, nhưng PWA cũ còn giữ module
Settings trong cache. Shell v7 ưu tiên network khi online, giữ cache tĩnh làm
fallback offline; registration bỏ HTTP cache khi kiểm tra worker, kiểm tra lại lúc
focus/online. Không tự reload ảnh đang chỉnh. PWA đã mở cần Ctrl+Shift+R một lần.

Hai bài E2E mới dựng worker legacy v5: cập nhật rồi reload hiện mục Windows mà
không xóa site data; cập nhật trong Scanner giữ nguyên ảnh đang review. Hai bài này
và ba bài responsive/theme đều đạt. Kiểm thử offline shell cũng được giữ lại.
