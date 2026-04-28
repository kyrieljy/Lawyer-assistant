import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import Body, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import backend


ROOT_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT_DIR / "renderer-dist"
EXPORT_DIR = backend.data_dir() / "exports"
TEMP_UPLOAD_DIR = backend.data_dir() / "tmp_uploads"
SESSION_COOKIE = "lawyer_session"

app = FastAPI(title="律师案件进度助手 H5 API")

WRITE_ACTIONS = {
    "saveSettings": "保存系统设置",
    "saveField": "保存案件字段",
    "reorderFields": "调整案件字段顺序",
    "saveCase": "保存案件",
    "saveEvent": "保存往来事件",
    "confirmDeadline": "确认期限",
    "cancelDeadline": "取消期限提醒",
    "deleteDeadline": "删除期限",
    "uploadFiles": "上传归档文件",
    "deleteCase": "停用案件",
    "deleteEvent": "删除事件",
    "deleteDocument": "删除文件记录",
    "runOcr": "执行 OCR",
    "createEventFromOcr": "根据 OCR 生成事件",
    "generateProgressSummary": "生成进度摘要",
    "saveProgressSummary": "保存进度摘要",
    "sendTestFeishu": "发送飞书测试",
    "checkReminders": "检查并发送提醒",
    "saveExportMappings": "保存导出映射",
    "makeBackup": "创建备份",
}


def safe_filename(name: str, fallback: str) -> str:
    cleaned = "".join(ch if ch not in '\\/:*?"<>|' else "_" for ch in (name or "").strip())
    return cleaned or fallback


def assert_under_data_dir(path: Path) -> Path:
    resolved = path.resolve()
    root = backend.data_dir().resolve()
    if resolved != root and root not in resolved.parents:
        raise HTTPException(status_code=403, detail="只能访问服务器数据目录内的文件")
    return resolved


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else ""


def require_user(request: Request) -> dict[str, Any]:
    user = backend.get_user_by_session(request.cookies.get(SESSION_COOKIE, ""))
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


def require_admin(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="只有管理员可以管理账号")
    return user


def summarize_payload(command: str, payload: dict[str, Any]) -> tuple[str, str, str]:
    if command == "saveCase":
        case = payload.get("case", {})
        return "case", case.get("id", ""), f"委托主体：{case.get('client_name', '')}"
    if command == "saveEvent":
        event = payload.get("event", {})
        return "event", event.get("id", ""), f"事件摘要：{event.get('summary', '')}"
    if command == "saveSettings":
        keys = [key for key in payload.get("settings", {}).keys() if "key" not in key and "secret" not in key]
        return "settings", "", "更新项：" + "，".join(keys[:20])
    if command == "saveField":
        field = payload.get("field", {})
        return "field", field.get("id", ""), f"字段：{field.get('label', '')}"
    for key in ("caseId", "eventId", "deadlineId", "documentId", "ocrResultId"):
        if payload.get(key):
            return key.replace("Id", ""), payload.get(key, ""), ""
    return command, "", ""


@app.on_event("startup")
def startup() -> None:
    backend.init({})


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(request: Request) -> dict[str, Any]:
    return {"ok": True, "user": backend.get_user_by_session(request.cookies.get(SESSION_COOKIE, ""))}


@app.post("/api/auth/login")
def auth_login(request: Request, response: Response, payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    try:
        user = backend.authenticate_user(payload.get("username", ""), payload.get("password", ""))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    token, _expires_at = backend.create_session(user["id"])
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("COOKIE_SECURE") == "1",
        max_age=backend.SESSION_DAYS * 24 * 60 * 60,
    )
    backend.log_business_action(user, "登录", "user", user["id"], "", client_ip(request))
    return {"ok": True, "user": user}


@app.post("/api/auth/register")
def auth_register(request: Request, response: Response, payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    try:
        user = backend.register_user(
            payload.get("username", ""),
            payload.get("fullName", ""),
            payload.get("position", ""),
            payload.get("password", ""),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    token, _expires_at = backend.create_session(user["id"])
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("COOKIE_SECURE") == "1",
        max_age=backend.SESSION_DAYS * 24 * 60 * 60,
    )
    backend.log_business_action(user, "注册账号", "user", user["id"], f"姓名：{user.get('full_name', '')}", client_ip(request))
    return {"ok": True, "user": user}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    backend.delete_session(request.cookies.get(SESSION_COOKIE, ""))
    response.delete_cookie(SESSION_COOKIE)
    backend.log_business_action(user, "退出登录", "user", user["id"], "", client_ip(request))
    return {"ok": True}


@app.get("/api/business-logs")
def business_logs(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    return {"ok": True, "logs": backend.get_business_logs(300)}


@app.get("/api/users")
def users(_admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return {"ok": True, "users": backend.list_users()}


@app.post("/api/users/{user_id}")
def update_user(
    user_id: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    try:
        user = backend.update_user(
            user_id,
            active=payload.get("active") if "active" in payload else None,
            password=payload.get("password") or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    detail = []
    if "active" in payload:
        detail.append("启用" if payload.get("active") else "停用")
    if payload.get("password"):
        detail.append("重置密码")
    backend.log_business_action(admin, "管理账号", "user", user_id, "，".join(detail), client_ip(request))
    return {"ok": True, "user": user, "users": backend.list_users()}


@app.post("/api/call/{command}")
def call_backend(
    command: str,
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_user),
) -> JSONResponse:
    if command not in backend.COMMANDS or command == "exportExcel":
        raise HTTPException(status_code=404, detail=f"Unknown command: {command}")
    result = backend.COMMANDS[command](payload or {})
    if command in WRITE_ACTIONS:
        target_type, target_id, detail = summarize_payload(command, payload or {})
        backend.log_business_action(user, WRITE_ACTIONS[command], target_type, target_id, detail, client_ip(request))
    return JSONResponse(result)


@app.post("/api/upload-temp")
async def upload_temp(
    request: Request,
    files: list[UploadFile] = File(...),
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    TEMP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for item in files:
        filename = safe_filename(item.filename or "", "upload.bin")
        suffix = Path(filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=TEMP_UPLOAD_DIR) as target:
            shutil.copyfileobj(item.file, target)
            temp_path = Path(target.name)
        final_path = temp_path.with_name(filename)
        counter = 2
        while final_path.exists():
            final_path = temp_path.with_name(f"{Path(filename).stem}_{counter}{suffix}")
            counter += 1
        temp_path.rename(final_path)
        paths.append(str(final_path))
    backend.log_business_action(user, "上传临时文件", "file", "", f"文件数：{len(paths)}", client_ip(request))
    return {"ok": True, "paths": paths}


@app.post("/api/import-database")
async def import_database(
    request: Request,
    database: UploadFile = File(...),
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    TEMP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = safe_filename(database.filename or "", "uploaded-app.db")
    if not filename.lower().endswith((".db", ".sqlite", ".sqlite3")):
        raise HTTPException(status_code=400, detail="请上传 .db/.sqlite 数据库文件")
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix, dir=TEMP_UPLOAD_DIR) as target:
        shutil.copyfileobj(database.file, target)
        temp_path = Path(target.name)
    try:
        result = backend.import_database_file(temp_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        try:
            temp_path.unlink()
        except OSError:
            pass
    backend.log_business_action(user, "导入旧数据库", "database", "", f"文件：{filename}", client_ip(request))
    return result


@app.post("/api/export-excel")
def export_excel(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_user),
) -> FileResponse:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    default_name = safe_filename(payload.get("defaultName", ""), "案件进度表.xlsx")
    if not default_name.lower().endswith(".xlsx"):
        default_name += ".xlsx"
    output_path = EXPORT_DIR / default_name
    result = backend.export_excel({"outputPath": str(output_path), "scope": payload.get("scope", {"mode": "all"})})
    backend.log_business_action(user, "导出 Excel", "export", "", f"案件数：{result.get('count', 0)}", client_ip(request))
    headers = {
        "X-Export-Count": str(result.get("count", 0)),
        "X-Export-Path": str(output_path),
        "Access-Control-Expose-Headers": "X-Export-Count, X-Export-Path",
    }
    return FileResponse(
        str(output_path),
        filename=default_name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.get("/api/download-file")
def download_file(path: str, user: dict[str, Any] = Depends(require_user)) -> FileResponse:
    file_path = assert_under_data_dir(Path(path))
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(str(file_path), filename=file_path.name)


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("server:app", host=host, port=port, reload=os.environ.get("RELOAD") == "1")


if __name__ == "__main__":
    main()
