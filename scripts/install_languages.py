"""Install official CPU language data to a per-user folder without administrator access."""
import os
from pathlib import Path
import urllib.request

base = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share"))
target = base / "ScreenGuardPlus" / "tessdata"
target.mkdir(parents=True, exist_ok=True)
for language in ("eng", "vie"):
    destination = target / f"{language}.traineddata"
    if destination.is_file() and destination.stat().st_size > 100_000:
        print(f"{language}: already installed")
        continue
    temporary = destination.with_suffix(".download")
    try:
        url = f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/{language}.traineddata"
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open("wb") as output:
            while chunk := response.read(64 * 1024):
                output.write(chunk)
        if temporary.stat().st_size < 100_000:
            raise RuntimeError("Language download was incomplete.")
        temporary.replace(destination)
        print(f"{language}: installed")
    finally:
        temporary.unlink(missing_ok=True)
print(f"Language data: {target}")
