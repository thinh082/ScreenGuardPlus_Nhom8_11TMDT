"""Windows Build & Packaging Script for ScreenGuard+.

Automates PyInstaller onedir compilation, Tesseract bundling (optional/auto),
and Inno Setup installer creation.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def find_iscc() -> Path | None:
    """Find Inno Setup Compiler (ISCC.exe)."""
    candidates = [
        shutil.which("iscc"),
        shutil.which("ISCC.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Inno Setup 6/ISCC.exe",
        Path(os.environ.get("ProgramFiles", "")) / "Inno Setup 6/ISCC.exe",
        Path(os.environ.get("ProgramFiles(x86)", "")) / "Inno Setup 6/ISCC.exe",
    ]
    for c in candidates:
        if c and Path(c).is_file():
            return Path(c).resolve()
    return None


def get_dir_size_mb(path: Path) -> float:
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return round(total / (1024 * 1024), 2)


def ensure_ico():
    ico = Path("frontend/icons/app.ico")
    png = Path("frontend/icons/icon-512.png")
    if not ico.is_file() and png.is_file():
        from PIL import Image
        img = Image.open(png)
        ico.parent.mkdir(parents=True, exist_ok=True)
        img.save(ico, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        print(f"[Icon] Generated {ico}")


def bundle_tesseract_to_dist(target_tess_dir: Path):
    """Copy portable Tesseract runtime + eng/vie tessdata into target folder."""
    src_tess = Path(r"C:\Program Files\Tesseract-OCR")
    if not (src_tess / "tesseract.exe").is_file():
        print("[Tesseract] System Tesseract-OCR not found at default location; skipping runtime bundle.")
        return False

    print(f"[Tesseract] Bundling portable Tesseract OCR into {target_tess_dir}...")
    target_tess_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy executable and DLLs
    shutil.copy2(src_tess / "tesseract.exe", target_tess_dir / "tesseract.exe")
    for dll in src_tess.glob("*.dll"):
        shutil.copy2(dll, target_tess_dir / dll.name)

    # Copy traineddata (eng, vie)
    tessdata_dst = target_tess_dir / "tessdata"
    tessdata_dst.mkdir(parents=True, exist_ok=True)
    
    user_tessdata = Path(os.environ.get("LOCALAPPDATA", "")) / "ScreenGuardPlus/tessdata"
    for lang in ("eng", "vie"):
        trained = f"{lang}.traineddata"
        src_lang = None
        if user_tessdata.is_dir() and (user_tessdata / trained).is_file():
            src_lang = user_tessdata / trained
        elif (src_tess / "tessdata" / trained).is_file():
            src_lang = src_tess / "tessdata" / trained
        
        if src_lang:
            shutil.copy2(src_lang, tessdata_dst / trained)
            print(f"[Tesseract] Copied {trained} ({round(src_lang.stat().st_size / (1024*1024), 2)} MB)")
        else:
            print(f"[Tesseract] Warning: {trained} not found.")

    # Verify bundled execution
    test_run = subprocess.run(
        [str(target_tess_dir / "tesseract.exe"), "--version"],
        capture_output=True,
        text=True,
    )
    if test_run.returncode == 0:
        print(f"[Tesseract] Bundled Tesseract verified: {test_run.stdout.splitlines()[0]}")
        return True
    else:
        print(f"[Tesseract] Warning: Bundled tesseract test failed: {test_run.stderr}")
        return False


def build():
    parser = argparse.ArgumentParser(description="ScreenGuard+ Windows Packaging Pipeline")
    parser.add_argument("--clean", action="store_true", help="Clean build directories before starting")
    parser.add_argument("--skip-pyinstaller", action="store_true", help="Skip PyInstaller build")
    parser.add_argument("--skip-installer", action="store_true", help="Skip Inno Setup installer compilation")
    parser.add_argument("--no-tesseract", action="store_true", help="Do not bundle Tesseract OCR into portable distribution")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    os.chdir(project_root)
    print(f"=== ScreenGuard+ Windows Build Pipeline ===")
    print(f"Working Directory: {project_root}")

    ensure_ico()

    if args.clean:
        print("[Clean] Removing previous build directories...")
        for p in ("build", "dist/ScreenGuardPlus"):
            target = project_root / p
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)

    dist_app = project_root / "dist/ScreenGuardPlus"

    # Step 1: PyInstaller
    if not args.skip_pyinstaller:
        print("\n--- Step 1: Running PyInstaller (onedir mode) ---")
        cmd = [sys.executable, "-m", "PyInstaller", "screenguard.spec", "--noconfirm"]
        print("Running:", " ".join(cmd))
        result = subprocess.run(cmd)
        if result.returncode != 0:
            print("[Error] PyInstaller build failed!")
            sys.exit(result.returncode)
        
        exe = dist_app / "ScreenGuardPlus.exe"
        if not exe.is_file():
            print(f"[Error] Output executable {exe} not found!")
            sys.exit(1)
        print(f"[Success] ScreenGuardPlus.exe created in {dist_app}")

    # Step 2: Bundle Tesseract OCR
    if not args.no_tesseract and dist_app.is_dir():
        print("\n--- Step 2: Bundling Tesseract OCR Runtime ---")
        bundle_tesseract_to_dist(dist_app / "tesseract")

    app_size_mb = get_dir_size_mb(dist_app) if dist_app.is_dir() else 0
    print(f"[Info] Portable app directory size: {app_size_mb} MB")

    # Step 3: Inno Setup
    if not args.skip_installer:
        print("\n--- Step 3: Compiling Windows Installer (Inno Setup) ---")
        iscc = find_iscc()
        if not iscc:
            print("[Warning] Inno Setup compiler (ISCC.exe) not found.")
            print("To build the installer, install Inno Setup: winget install JRSoftware.InnoSetup")
        else:
            iss_file = project_root / "installer/screenguard.iss"
            print(f"Using Inno Setup: {iscc}")
            print(f"Compiling: {iss_file}")
            iscc_cmd = [str(iscc), str(iss_file)]
            res = subprocess.run(iscc_cmd)
            if res.returncode == 0:
                setup_exe = project_root / "dist/ScreenGuardPlus-Setup.exe"
                if setup_exe.is_file():
                    setup_mb = round(setup_exe.stat().st_size / (1024 * 1024), 2)
                    print(f"\n[Success] Windows Installer created: {setup_exe} ({setup_mb} MB)")
                else:
                    print("[Warning] Inno Setup finished but output file not found.")
            else:
                print(f"[Error] Inno Setup failed with exit code {res.returncode}")

    print("\n=== Build Complete ===")
    print(f"Portable App: {dist_app}")
    setup_file = project_root / "dist/ScreenGuardPlus-Setup.exe"
    if setup_file.is_file():
        print(f"Setup Installer: {setup_file}")


if __name__ == "__main__":
    build()

