# ScreenGuard+ — Pre-Demo QA & False Positive Validation

Ngày kiểm thử: **30/10/2026**. Baseline: `d1db102` trên `tuvy1`.
Worktree riêng: `C:\ScreenGuardPlus_QA_PreDemo`, nhánh `qa/pre-demo-validation`.
Không thay đổi workspace demo, UI, kiến trúc/OCR concurrency hoặc Windows Installer.

## Kết luận và điều kiện demo

**Luồng demo đạt trên dữ liệu thử đã xác định; chưa thể cam kết nhận diện mọi ảnh.**
Đã xác minh file mới → Windows Watchdog → OCR thật → cảnh báo → PWA review đúng ảnh
→ xuất thiếu password bị BLOCK → che → tải đúng PNG → hash SHA-256 khớp.
13 ảnh sạch không sinh cảnh báo nhạy cảm. 5 file secret tạo liên tiếp nhận đủ
5 cảnh báo, không dropped/rejected; thời gian đến callback thông báo 1,11–2,82 giây.

Không có ảnh gốc Chrome/ChatGPT/YouTube mà người dùng báo, nên **chưa kết luận
finding cụ thể trong sự cố đó**. Không tự đọc thư mục ảnh cá nhân để tìm ảnh.
Một ảnh YouTube thật, chưa đăng nhập, được chụp/kiểm tra riêng trả 0 findings.
Các ảnh ChatGPT/Chrome mô phỏng có `DATABASE_PASSWORD=DemoPass123!` hoặc API key giả
trả đúng `DB_CREDENTIAL`/`API_KEY`: đây là **phát hiện theo mẫu**, không xác nhận
password/key có thật, đang hoạt động hay đã bị lộ khỏi máy.

Có 5 false positive detector tại baseline, đã tái hiện bằng cả text oracle và
ảnh qua Tesseract trước khi sửa. Nhánh QA chỉ thêm điều kiện loại placeholder rõ
ràng và câu định nghĩa trong generic assignment rules. Bộ đo sau sửa còn 0 FP,
nhưng vẫn có FN do OCR. **Chưa merge vào `tuvy1`/`main`; bản demo không tự nhận sửa này.**

## Môi trường và phương pháp

- Windows, Python 3.12, Tesseract thật với `eng`/`vie`, CPU; chi tiết version và hash
  traineddata ghi trong JSON đính kèm. Không cloud, không mock OCR/detector.
- 26 ảnh tổng hợp: 13 negative, 13 positive, tổng 16 entity ground truth;
  23 ảnh chữ rõ và 3 ảnh stress nhỏ/mờ. Text, type, vị trí dòng, font/cỡ/blur nằm
  trong [corpus.py](../tests/qa/corpus.py), khai báo trước khi chạy detector.
- Một ảnh public YouTube thật kiểm tra riêng, không gộp vào chỉ số corpus tổng hợp.
  [Ảnh](../tests/qa/fixtures/youtube-public.png) và
  [metadata](../tests/qa/fixtures/youtube-capture.json). Không có session cá nhân.
- TP: finding cùng type, giao với dòng ground truth, ghép một-một. Finding không
  ghép được là FP; entity còn thiếu là FN. Đây không phải phép đo segmentation
  bbox chính xác từng pixel. Mọi FN, kể cả ca xfail, vẫn được tính vào recall.
- Mỗi ảnh đo 1 lượt tuần tự, không warmup; latency gồm validate, OCR, PII/secrets,
  policy và ticket. OCR lần riêng để chẩn đoán không tính vào latency. Median là
  trung vị các sample đã ghi, không phải thời gian hiển thị toast trên desktop.
- Chạy thêm detector trên text nguồn lý tưởng để tách lỗi detector với OCR/geometry.
  Oracle không được dùng thay kết quả OCR hoặc tính thành TP của ảnh.
- Đây là tập nhỏ, có chủ ý chứa tình huống khó, chủ yếu tiếng Anh; **không dùng số
  liệu này để quảng cáo độ chính xác sản phẩm**, không có khoảng tin cậy thống kê.

## Kết quả TC01–TC12

| TC | Trạng thái | Bằng chứng và giới hạn |
|---|---|---|
| TC01 Phong cảnh không chữ | PASS | Ảnh phong cảnh tổng hợp, 0 findings; không đọc dữ liệu cá nhân. |
| TC02 YouTube sạch | PASS mẫu đã chụp | Trang YouTube thật HTTP 200, visually reviewed, 0 findings, 496,92 ms (`eng`). Browser mô phỏng sạch cũng 0. Không đại diện trang có comments/email/tài khoản cá nhân. |
| TC03 Văn bản học tập | FAIL baseline → PASS QA | Câu `API_KEY: authentication identifies the calling application.` và `Token: authentication is the process...` từng bị CRITICAL; regression oracle + ảnh đã qua. |
| TC04 Khái niệm DATABASE_PASSWORD | FAIL baseline → PASS QA | Tên biến đứng riêng, assignment rỗng, `${...}`, `<...>` không cảnh báo. Câu `DATABASE_PASSWORD: stores the database password...` và placeholder `your_password_here` trước sửa bị nhận sai; sau sửa 0. |
| TC05 Password có giá trị | PASS | PNG thật `DATABASE_PASSWORD=DemoPass123!` → `DB_CREDENTIAL`/CRITICAL; PWA/agent dùng pipeline chung. Không tra tên file. |
| TC06 Chat có secret giả | PASS theo mẫu | Ba browser mô phỏng chứa password/API key giả trả đúng type và số vùng; ảnh nhiều tab có 2 vùng. Không xác minh tính hiệu lực của credential. Ảnh chat gốc của người dùng: SKIP, thiếu ảnh. |
| TC07 Email/CCCD/STK giả | PARTIAL / có FN | `eng`: email, bank và CCCD Arial nhận được; 2 entity CCCD Consolas bị OCR nhầm chữ. Chế độ mặc định `vie+eng` có kết quả khác, xem số liệu và chẩn đoán dưới. |
| TC08 Chữ nhỏ/mờ | FAIL nhận diện, đã đo | 3/3 entity stress bị bỏ sót cả `eng` và `vie+eng`. Oracle tìm đủ type từ text nguồn; ảnh OCR rỗng/đọc sai. Không tính các ca này là pass nhận diện. |
| TC09 Agent ảnh sạch | PASS | 13 negative qua file Windows thật → scanned đủ 13, 0 sensitive alerts; YouTube public thật qua E2E cũng không có notification. |
| TC10 Agent secret giả | PASS file/notification | Burst 5 file → 5 cảnh báo, không rơi; duplicate bị chặn đúng thiết kế. Native Windows toast gửi thật và kiểm tra XML/history với identity QA riêng, không raw password. Chưa bấm Win+PrtScn/click toast bằng tay trong lượt này. |
| TC11 BLOCK/WARN/ALLOW | PASS | API backend thật: còn password → BLOCK/403; che password còn email → WARN/400; xác nhận warnings → xuất; che đủ → ALLOW. Không xác nhận ngầm. |
| TC12 PNG/đúng ảnh/hash | PASS | E2E so hash ảnh review với ảnh terminal nguồn, không gọi OCR lại; export 403 không tải file, sau che đúng 1 download; pixel đục, vùng ngoài giữ nguyên, SHA-256 byte PNG khớp `X-Image-Hash`. |

PASS ở đây chỉ áp dụng các input và điều kiện đã chạy. SKIP/FAIL nhận diện không
bị chuyển thành PASS vì ứng dụng không crash.

## Số liệu đo thực tế

### Entity-level, toàn bộ 26 ảnh / 16 entity

| Bản / cấu hình | TP | FP | FN | Precision | Recall | F1 | Median scan | Max scan |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline `d1db102`, `eng` | 11 | 5 | 5 | 68,75% | 68,75% | 68,75% | 279,32 ms | 776,81 ms |
| QA sau sửa FP, `eng` | 11 | 0 | 5 | 100% | 68,75% | 81,48% | 268,00 ms | 392,53 ms |
| QA sau sửa FP, mặc định `vie+eng` | 9 | 0 | 7 | 100% | 56,25% | 72,00% | 311,97 ms | 439,17 ms |

Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2TP/(2TP+FP+FN).
100% precision ở tập này chỉ là **0 FP trong tập thử**, không bảo đảm ảnh khác an toàn.
Không diễn giải chênh lệch thời gian hai lượt thành tăng tốc vì mỗi ảnh chỉ đo 1 lần.

### Chữ rõ và stress tách riêng

| Tập | TP/FP/FN | Precision | Recall | F1 |
|---|---|---:|---:|---:|
| 23 ảnh rõ, QA `eng` | 11 / 0 / 2 | 100% | 84,62% | 91,67% |
| 23 ảnh rõ, QA `vie+eng` | 9 / 0 / 4 | 100% | 69,23% | 81,82% |
| 3 ảnh stress, cả hai cấu hình | 0 / 0 / 3 | Không xác định: không có dự đoán | 0% | 0% |

Baseline có 5/13 ảnh negative bị báo; QA có 0/13. Đây là image-level false-alert
count, khác entity-level FP trong công thức trên. Một ảnh có thể chứa nhiều entity.

### File mới đến callback cảnh báo

Lượt 5 ảnh khác nhau ghi liên tiếp: **1110,38 / 1475,63 / 2142,95 / 2469,91 /
2819,08 ms**, median 2142,95 ms. Đã tính thời gian ghi file, debounce 0,8 giây,
hàng đợi và OCR tuần tự. 5/5 alerts; dropped=0, rejected=0. File duplicate sau đó
không tạo notification thứ hai. Không đo độ trễ hiển thị toast/DND, không suy ra SLO
cho screenshot lớn hoặc hàng đợi dài. Ảnh nhỏ/bình thường này không cần nâng đa luồng.

Evidence JSON có sample từng ảnh, expected/actual types, bbox, OCR confidence,
preview đã mask, text OCR **chỉ của dữ liệu tổng hợp**, cùng environment/hash:

- [Baseline](qa/pre-demo-baseline.json)
- [QA `eng`](qa/pre-demo-final.json)
- [QA `vie+eng`](qa/pre-demo-default-language.json)
- [Agent latency](qa/pre-demo-agent-latency.json)
- [YouTube public](qa/pre-demo-youtube-result.json)

## False positive và nguyên nhân sửa production

| Input giả lập | Baseline finding | Nguyên nhân | Sau sửa |
|---|---|---|---|
| `DATABASE_PASSWORD: stores the database password for an application.` | DB_CREDENTIAL / CRITICAL | Regex coi từ `stores` sau dấu `:` là giá trị, không xét phần câu còn lại. | 0 |
| `DATABASE_PASSWORD=your_password_here` | DB_CREDENTIAL / CRITICAL | Chưa lọc placeholder có cấu trúc rõ ràng. | 0 |
| `API_KEY: authentication identifies the calling application.` | API_KEY / CRITICAL | Lấy một từ dài trong câu định nghĩa làm key. | 0 |
| `Token: authentication is the process of checking identity.` | API_KEY / CRITICAL | Generic token rule chỉ dựa nhãn/độ dài. | 0 |
| `API_KEY=your_api_key_here` | API_KEY / CRITICAL | Chưa lọc placeholder rõ ràng. | 0 |

Chỉ sửa [core/secrets_detector.py](../core/secrets_detector.py): helper cho hai
generic assignment rules, không thay OCR/provider patterns/PII hoặc tên file.
5 regression tests đã fail trên baseline trước khi sửa, sau đó pass với text oracle
và ảnh thật. Giá trị letter-only dùng `=`/dấu nháy, value có chữ số/ký tự đặc biệt,
và secret giả đúng cấu trúc vẫn được phát hiện.

Đánh đổi: nhận biết câu định nghĩa/placeholder là heuristic. Nếu một hệ thống thực
sự dùng chính placeholder như password, hoặc một credential toàn chữ không đặt
dấu nháy và đi kèm câu văn sau dấu `:`, quy tắc loại trừ có thể bỏ sót. Không có
kiểm tra credential online; không dùng thuật toán này làm bằng chứng secret hợp lệ.

## Lỗi OCR và hạn chế phải trình bày

- `eng`: dãy `000000000000` trong font Consolas bị OCR thành chữ `e`/ký tự khác;
  detector trên text lý tưởng nhận CCCD, nhưng ảnh thiếu 2 entity. Arial là control
  nhận được. Không tự đổi ảnh ground truth để che giấu FN.
- `vie+eng`: có email bị chèn khoảng trắng trong tên miền, dãy CCCD bị đổi số lượng
  ký tự; URI PostgreSQL bị tách username/password/ký tự. Vì vậy 4 FN ở ảnh rõ.
- Cả hai cấu hình: password cỡ 10px, password mờ cỡ 14px và email mờ cỡ 12px đều
  không được đọc đủ; 3 FN stress. Không có cảnh báo không đồng nghĩa ảnh sạch.
- Hệ thống nhận dạng mẫu trong **toàn ảnh**, không hiểu tab YouTube là nguyên nhân
  hay tự loại đoạn hội thoại. Secret giả nhìn thấy trong chat vẫn có thể gây alert.
- Watcher cần file PNG/JPEG mới trong đúng thư mục đã cấp quyền. Clipboard-only
  PrtScn/Win+Shift+S không kích hoạt nếu không lưu file. Clipboard chưa triển khai.
- “Cảnh báo sau khi chụp” là sau file được ghi xong và OCR hoàn tất; có debounce,
  hàng đợi, giới hạn ảnh và có thể có Windows DND/quyền notification. Không chặn
  OS, không tự che hoặc tự gửi ảnh. Cảnh báo nổi/nút chuông là kênh review hiện có.
- Duplicate theo nội dung được suppress trong cùng phiên watcher, nên chụp lại y
  hệt không tạo alert lặp. Chụp mới với nội dung khác sẽ được xử lý riêng.
- Chưa kiểm thử phần cứng Win+PrtScn và click toast vật lý. Native delivery test
  không được dùng thay chứng cứ hai thao tác này. Chưa có ảnh sự cố gốc để kết luận.
- Phiên review/ticket chỉ trong RAM, giới hạn/TTL; restart hoặc để quá lâu có thể
  hết phiên. Hash khớp xác minh toàn vẹn file xuất, không chứng minh OCR không bỏ sót.

## Regression đã chạy

| Lệnh | Kết quả |
|---|---|
| `python -m pytest -q` | 153 passed, 1 skipped, 2 xfailed; 44,17 s |
| Native opt-in: `SCREENGUARD_QA_NATIVE=1`, `pytest ... -k windows_native -q` | 1 passed, 31 deselected; 2,55 s |
| `npm test` | 8/8 passed |
| `npm run test:e2e` | 35/35 passed; khoảng 1,4 phút |

Skip mặc định là native toast opt-in để không gây popup ngoài ý muốn ở CI; đã chạy
riêng trên Windows. Hai xfail là CCCD OCR Consolas, không phải xfail detector hay
che lỗi export. Native QA dùng identity `ScreenGuardPlus.PreDemoQA` và folder tạm
riêng; không xóa notification/history của demo đang hoạt động.

E2E acceptance được chạy lại sau khi bổ sung kiểm tra SHA-256 ảnh review nguồn.
Hướng dẫn lệnh, data và giới hạn scoring: [tests/qa/README](../tests/qa/README.md).

## Demo ngắn và lời trình bày

1. Mở Settings, chọn thư mục Screenshots chính xác, bật theo dõi và kiểm tra
   **Running**, Tesseract sẵn sàng. Chọn `eng` cho terminal tiếng Anh, chữ ≥30px.
   Nói: “Chúng em chỉ theo dõi thư mục đã được người dùng cho phép; không đọc clipboard.”
2. Mở terminal có `DATABASE_PASSWORD=DemoPass123!` và một email giả, chụp để lưu
   **file mới** vào folder đó. Có thể đóng PWA trước khi chụp.
   Nói: “Đây là dữ liệu giả để minh họa phát hiện theo mẫu, không phải secret đã xác thực.”
3. Chờ OCR rồi mở thông báo hoặc nút chuông/cảnh báo nổi → review đúng ảnh.
   Nói: “Agent chạy độc lập với PWA, ảnh được xử lý local; mọi vùng vẫn cần người dùng kiểm tra.”
4. Bỏ chọn vùng password, chỉ che email và thử tải → backend BLOCK/403.
   Nói: “Client không thể yêu cầu xuất thiếu vùng secret bắt buộc bằng ticket này.”
5. Chọn tất cả → che → tải PNG; trình bày vùng che đục và SHA-256.
   Nói: “Hash kiểm tra tính toàn vẹn ảnh xuất. OCR có thể bỏ sót, nên chúng em vẫn yêu cầu review.”
6. Đưa ảnh YouTube sạch đã kiểm tra vào folder → không có sensitive alert; sau đó
   tắt theo dõi, kiểm tra Stopped. Không kết luận ảnh khác chắc chắn an toàn.

Không dùng lại file y hệt cho vòng demo tiếp theo vì dedup; đổi nội dung giả/marker
trên terminal rồi chụp, hoặc tắt/bật theo dõi có chủ đích để tạo phiên watcher mới.

## Khôi phục khi demo lỗi

1. **Không báo:** xem Running, đường dẫn folder và file mới thực sự tồn tại; không
   chỉ copy vào clipboard. Chờ file ghi xong; xem lỗi watcher/OCR trong Settings.
   Kiểm tra đã bật đúng loại secret, ảnh không trùng nội dung lần trước.
2. **Stopped/không kết nối:** kiểm tra process companion, cổng loopback, chọn lại
   folder nếu bị di chuyển. Chỉ restart tiến trình demo do người trình bày quản lý;
   không chạy server thứ hai cùng cổng. `python -m desktop_agent.main` rồi mở đúng URL.
3. **OCR không sẵn sàng:** kiểm tra `/api/health`, Tesseract và `eng/vie`; tăng cỡ
   chữ terminal/độ tương phản, không chữa findings bằng dữ liệu hardcode. Dùng ảnh
   fixture giả đã chuẩn bị như phương án phụ và nói rõ là upload thủ công.
4. **Toast bị ẩn:** kiểm tra quyền notification/DND, bật cảnh báo nổi; dùng nút
   chuông **Thông báo** hiện có trong PWA. Đừng gọi đây là đã test click toast vật lý.
5. **Review/ticket hết hạn:** chụp ảnh mới có marker khác hoặc import/quét lại;
   không dùng ticket cũ và không bỏ qua backend BLOCK để tải ảnh gốc.
6. **PWA giữ code cũ:** chỉ reload khi không còn ảnh đang chỉnh, Ctrl+Shift+R rồi
   kiểm tra đúng server/branch đang chạy. Nhánh QA chưa tự áp vào demo/installer.
7. **Export BLOCK:** kiểm tra đủ vùng bắt buộc; che lại. Nếu WARN hãy review và
   xác nhận rõ ràng. Nếu lỗi hash/PNG thì dừng chia sẻ file, giữ log mã lỗi an toàn.

Không đưa password thật lên màn hình demo; không gửi ảnh private vào báo cáo.
Không tự merge nhánh QA. Các lỗi OCR và sự cố ảnh gốc chưa có bằng chứng được giữ
nguyên trạng thái để người trình bày quyết định trước buổi bảo vệ.
