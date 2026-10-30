# Pre-demo QA corpus

Run from the isolated QA worktree. Python requires the project development
dependencies and real Tesseract with `eng`/`vie`. Browser tests require Chromium.

```powershell
python -m tests.qa.measure --output tmp/pre-demo/eng.json
python -m tests.qa.measure --language vie+eng --output tmp/pre-demo/default.json
python -m tests.qa.agent_latency --output tmp/pre-demo/agent-latency.json
python -m pytest -q
$env:SCREENGUARD_QA_NATIVE = '1'
python -m pytest tests/test_pre_demo_qa.py -k native -q
Remove-Item Env:SCREENGUARD_QA_NATIVE
$env:SCREENGUARD_TEST_PORT = '8041'
$env:SCREENGUARD_AGENT_TEST_PORT = '8042'
npm test
npm run test:e2e
```

`corpus.py` defines all text, expected entity types/line positions, fonts, sizes
and blur **before** running the detector. No expected data is used in production.
The images depict fictional values; an example matching a credential pattern is
positive for pattern recognition, not evidence of an active leaked credential.

`measure.py` measures the shared production pipeline once per case, then runs
separate OCR diagnostics and an ideal text oracle. The latter isolates detector
misses from OCR/geometry losses; it is not included in the scan latency or counted
as a successful image recognition. Metrics match entities one-to-one by type and
intersection with the authored line. Multiple duplicate findings count as FP.
The rectangle ground truth is line-level, not an exact pixel segmentation score.

No warmup, no parallel OCR or tuning to image filenames. Results are environment
and font dependent, from a small intentionally difficult synthetic corpus. Do not
extrapolate its precision/recall to private screenshots or production traffic.
Two clear Consolas cases have explicit expected-failure markers for baseline OCR
losses; the measurement report still counts their missing entities as FN. The
three small/blurred stress images are measured rather than made to pass.

`fixtures/youtube-public.png` is a real public YouTube homepage captured in a new,
unauthenticated Chromium context, visually reviewed to contain no PII/credential
values. Capture metadata is in `youtube-capture.json`. It is a fixed regression
input, not a guarantee about other YouTube pages, comments or logged-in sessions.
YouTube/ChatGPT browser-like images in `corpus.py` are explicitly synthetic, not
captures of the user's chat. No personal screenshots are enumerated or read.

The Windows test uses an explicitly created test folder and an isolated
`ScreenGuardPlus.PreDemoQA` notification identity. It never clears the demo
companion's toast history. Recorder tests replace only the delivery channel,
never OCR/detection/watcher. E2E uses real local HTTP APIs and verifies the exact
review image SHA-256, the mandatory region's opaque pixels, untouched pixels, and
the hash of downloaded bytes. It captures only synthetic data in logs/artifacts.

`test-results/` is disposable and Playwright removes it each run. Keep measurement
outputs under ignored `tmp/pre-demo/`; selected safe JSON evidence is committed
under `docs/qa/`. No Windows installer/packaging code is involved.
