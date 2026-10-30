from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from core.resources import get_frontend_dir
from backend.api.routes import router
from backend.api.desktop import router as desktop_router, DesktopAccess


def create_app(desktop_agent=None):
    @asynccontextmanager
    async def lifespan(app):
        if desktop_agent:
            desktop_agent.start()
        try:
            yield
        finally:
            if desktop_agent:
                desktop_agent.close()

    instance = FastAPI(
        title="ScreenGuard+ API",
        version="0.5.0",
        description="Local Tesseract OCR and contextual PII detection; no cloud processing or persistent image storage.",
        lifespan=lifespan,
    )
    instance.state.desktop_agent = desktop_agent
    instance.state.desktop_access = DesktopAccess()
    instance.middleware("http")(privacy_headers)
    instance.include_router(router, prefix="/api")
    instance.include_router(desktop_router, prefix="/api")
    instance.mount("/", StaticFiles(directory=get_frontend_dir(), html=True), name="frontend")
    return instance


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


app = create_app()
