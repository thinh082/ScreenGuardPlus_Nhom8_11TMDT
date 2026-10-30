@echo off
setlocal
echo ========================================================
echo   ScreenGuard+ Windows Packaging & Installer Builder
echo ========================================================
cd /d "%~dp0\.."

python scripts\build_windows.py %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed with exit code %ERRORLEVEL%.
    exit /b %ERRORLEVEL%
)

echo.
echo [DONE] Build finished successfully.

