from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from backend.api.routes import router

app = FastAPI(
    title="ScreenGuard+ API",
    version="0.2.0",
    description="Local Tesseract OCR and contextual PII detection; no cloud processing or persistent image storage.",
)


@app.middleware("http")
async def privacy_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(), display-capture=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    else:
        response.headers["Cache-Control"] = "no-cache"
        if request.url.path not in ("/docs", "/redoc", "/openapi.json"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self'; "
                "img-src 'self' blob: data:; media-src 'self' blob:; "
                "connect-src 'self'; worker-src 'self'; object-src 'none'; "
                "base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
            )
    return response


app.include_router(router, prefix="/api")
app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[1] / "frontend", html=True), name="frontend")
