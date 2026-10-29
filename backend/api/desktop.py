"""Same-origin, loopback-only companion controls; no path/image URLs or open CORS."""
from collections import OrderedDict
import base64
import ipaddress
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from core.models import ContractModel, DetectionConfig

router = APIRouter(prefix="/desktop", include_in_schema=False)
COOKIE = "screenguard_desktop"


class DesktopAccess:
    def __init__(self):
        self.sessions = OrderedDict()

    def issue(self):
        now = time.monotonic()
        self.sessions = OrderedDict((k, v) for k, v in self.sessions.items() if v[1] > now)
        while len(self.sessions) >= 16:
            self.sessions.popitem(last=False)
        cookie, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.sessions[cookie] = (csrf, now + 12 * 3600)
        return cookie, csrf


def local_request(request: Request):
    try:
        local = request.client and ipaddress.ip_address(request.client.host).is_loopback
    except ValueError:
        local = False
    host = request.url.hostname
    if not local or host not in {"127.0.0.1", "localhost", "::1"}:
        raise HTTPException(403, "Companion chỉ nhận kết nối loopback.")
    origin = request.headers.get("origin")
    expected = f"{request.url.scheme}://{request.headers.get('host')}"
    if (origin and origin != expected) or request.headers.get("sec-fetch-site") not in {None, "same-origin", "none"}:
        raise HTTPException(403, "Nguồn truy cập không được phép.")


def authorized(request: Request):
    local_request(request)
    entry = request.app.state.desktop_access.sessions.get(request.cookies.get(COOKIE))
    if not entry or entry[1] <= time.monotonic() or not secrets.compare_digest(entry[0].encode("ascii"), request.headers.get("x-screenguard-csrf", "").encode("utf-8")):
        raise HTTPException(403, "Phiên điều khiển không hợp lệ; hãy kết nối lại.")


def companion(request: Request):
    value = request.app.state.desktop_agent
    if value is None:
        raise HTTPException(503, "Hãy chạy python -m desktop_agent.main trên Windows.")
    return value


@router.get("/session", dependencies=[Depends(local_request)])
async def session(request: Request, response: Response):
    if request.headers.get("x-screenguard-client") != "pwa" or request.headers.get("sec-fetch-site") not in {"same-origin", "none"}:
        raise HTTPException(403, "Hãy mở ScreenGuard+ trên địa chỉ local.")
    access = request.app.state.desktop_access
    existing = access.sessions.get(request.cookies.get(COOKIE))
    if existing and existing[1] > time.monotonic():
        return {"csrf": existing[0]}
    cookie, csrf = access.issue()
    response.set_cookie(COOKIE, cookie, httponly=True, samesite="strict", secure=request.url.scheme == "https", max_age=12 * 3600, path="/api/desktop")
    return {"csrf": csrf}


@router.get("/status", dependencies=[Depends(authorized)])
async def status(request: Request):
    agent = request.app.state.desktop_agent
    return agent.status() if agent else {"available": False, "running": False, "state": "Stopped", "enabled": False, "folder": None}


async def body(request: Request, model):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 64 * 1024:
            raise HTTPException(413, "Cấu hình vượt 64 KB.")
    try:
        return model.model_validate_json(data)
    except ValueError:
        raise HTTPException(422, "Cấu hình companion không hợp lệ.") from None


class Control(ContractModel):
    enabled: bool
    config: DetectionConfig


class PopupPreference(ContractModel):
    enabled: bool


@router.post("/popup", dependencies=[Depends(authorized)])
async def popup(request: Request):
    value = await body(request, PopupPreference)
    return await safe_call(companion(request).set_popup, value.enabled)


@router.get("/notifications", dependencies=[Depends(authorized)])
async def notifications(request: Request):
    agent = request.app.state.desktop_agent
    return {"available":bool(agent),"items":agent.reviews.notifications() if agent else [],"last_scan":agent.last_scan if agent else None}


async def safe_call(function, *args):
    try:
        return await run_in_threadpool(function, *args)
    except (ValueError, OSError, ImportError):
        raise HTTPException(422, "Không thực hiện được. Kiểm tra thư mục, quyền truy cập và dependencies của agent.") from None


@router.post("/folder", dependencies=[Depends(authorized)])
async def folder(request: Request):
    return await safe_call(companion(request).select_folder)


@router.post("/control", dependencies=[Depends(authorized)])
async def control(request: Request):
    value = await body(request, Control)
    agent = companion(request)
    await safe_call(agent.configure, value.config)
    return await safe_call(agent.enable, value.enabled)


@router.post("/config", dependencies=[Depends(authorized)])
async def configuration(request: Request):
    value = await body(request, DetectionConfig)
    agent = companion(request)
    await safe_call(agent.configure, value)
    return agent.status()


@router.get("/reviews/{key}", dependencies=[Depends(authorized)])
async def review(key: str, request: Request):
    item = companion(request).reviews.get(key) if len(key) <= 64 else None
    if item is None:
        raise HTTPException(410, "Ảnh review đã hết hạn hoặc agent đã dừng. Hãy chọn ảnh lại.")
    return {"image": base64.b64encode(item.image).decode("ascii"), "result": item.result.model_dump(mode="json")}


@router.delete("/reviews/{key}", dependencies=[Depends(authorized)])
async def discard(key: str, request: Request):
    companion(request).discard_review(key)
    return {"deleted": True}
