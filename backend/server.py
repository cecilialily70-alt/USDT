import os
import re
import certifi
import asyncio
import hashlib
import secrets
import uuid
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
from fastapi import FastAPI, Request, HTTPException, Depends, BackgroundTasks, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pydantic import BaseModel
import jwt
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

# ==========================================
# 优化 3: 数据库性能优化 (启动时创建索引)
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await ensure_indexes()
    except Exception:
        pass
    yield

app = FastAPI(lifespan=lifespan)

# ==========================================
# 优化 2: 严格的 CORS 限制 (保护你的专属域名)
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:5173", 
        "http://127.0.0.1:3000", 
        "https://www.ils-usdt.xyz",  # 你的主域名
        "https://ils-usdt.xyz"       # 兼容不带 www 的访问
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], 
    allow_headers=["Authorization", "Content-Type", "*"],
)

MONGO_URL = (
    os.environ.get("MONGO_URL")
    or os.environ.get("MONGODB_URI")
    or "mongodb://localhost:27017"
).strip().strip('"').strip("'")

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    JWT_SECRET = hashlib.sha256(f"{MONGO_URL}:exchange-admin".encode()).hexdigest()

DEFAULT_ADMIN_PATH = "/xiaoyan"
DEFAULT_ADMIN_PASSWORD = "Qw123456.."

def resolve_admin_path(config: dict) -> str:
    env_path = os.environ.get("ADMIN_PATH", "").strip()
    return config.get("adminPath") or env_path or DEFAULT_ADMIN_PATH

def create_mongo_client():
    """兼容 Vercel Serverless 的 MongoDB 连接"""
    common = {
        "serverSelectionTimeoutMS": 20000,
        "connectTimeoutMS": 20000,
        "socketTimeoutMS": 20000,
        "maxPoolSize": 10,
        "retryWrites": True,
    }
    if MONGO_URL.startswith("mongodb+srv://"):
        # Atlas SRV 自动启用 TLS；Vercel 上 certifi 路径有时不可用，故做双重回退
        return AsyncIOMotorClient(MONGO_URL, **common)
    if "mongodb.net" in MONGO_URL:
        return AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where(), **common)
    return AsyncIOMotorClient(MONGO_URL, **common)

mongo_client = create_mongo_client()
db = mongo_client.exchange_db
config_collection = db.config
whitelist_collection = db.whitelist
chat_sessions_collection = db.chat_sessions
chat_messages_collection = db.chat_messages
chat_images_fs = AsyncIOMotorGridFSBucket(db, bucket_name="chat_images")

_last_db_error = ""
_mongo_loop_id = None

async def ping_database():
    global _last_db_error
    ensure_mongo_context()
    try:
        await mongo_client.admin.command("ping")
        _last_db_error = ""
        return True
    except Exception as e:
        _last_db_error = f"{type(e).__name__}: {str(e)[:200]}"
        return False

_indexes_ready = False

def ensure_mongo_context():
    """
    Vercel Serverless 可能在不同事件循环中复用模块级对象。
    Motor 客户端绑定旧 loop 后会出现 RuntimeError（如 Task cb...）。
    """
    global mongo_client, db, config_collection, whitelist_collection
    global chat_sessions_collection, chat_messages_collection, chat_images_fs
    global _mongo_loop_id, _indexes_ready

    try:
        loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        loop_id = None

    if _mongo_loop_id == loop_id:
        return

    mongo_client = create_mongo_client()
    db = mongo_client.exchange_db
    config_collection = db.config
    whitelist_collection = db.whitelist
    chat_sessions_collection = db.chat_sessions
    chat_messages_collection = db.chat_messages
    chat_images_fs = AsyncIOMotorGridFSBucket(db, bucket_name="chat_images")
    _mongo_loop_id = loop_id
    _indexes_ready = False

async def ensure_indexes():
    global _indexes_ready
    ensure_mongo_context()
    if _indexes_ready:
        return
    specs = [
        (whitelist_collection, "ip", {"unique": True}),
        (chat_sessions_collection, "session_id", {"unique": True}),
        (chat_sessions_collection, [("last_message_at", -1)], {}),
        (chat_messages_collection, [("session_id", 1), ("created_at", 1)], {}),
        (chat_messages_collection, "message_id", {"unique": True}),
    ]
    for collection, keys, opts in specs:
        try:
            await collection.create_index(keys, **opts)
        except Exception:
            pass
    try:
        await chat_messages_collection.create_index(
            [("session_id", 1), ("client_message_id", 1)],
            unique=True,
            partialFilterExpression={"client_message_id": {"$exists": True, "$type": "string"}},
        )
    except Exception:
        pass
    _indexes_ready = True

async def safe_find_one(collection, query, projection=None):
    ensure_mongo_context()
    if not await ping_database():
        return None
    await ensure_indexes()
    return await collection.find_one(query, projection or {})

async def get_config_doc():
    return await safe_db_op(
        lambda: safe_find_one(config_collection, {}, {"_id": 0}),
        fallback={},
    ) or {}

async def safe_db_op(coro_factory, fallback=None):
    try:
        return await coro_factory()
    except Exception:
        return fallback

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB 原图不压缩
ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/gif",
    "image/webp", "image/heic", "image/heif", "image/bmp",
}

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="登录状态已过期，请重新登录")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="无效的访问凭证")

class PublicConfig(BaseModel):
    buyRate: float = 4.4
    sellRate: float = 3.3
    whatsappLink: str = "https://wa.me/972552452669"

class AdminConfig(PublicConfig):
    adminPath: str = DEFAULT_ADMIN_PATH
    adminPassword: str = DEFAULT_ADMIN_PASSWORD

class LoginRequest(BaseModel):
    password: str

class PathCheckRequest(BaseModel):
    path: str

class WhitelistIP(BaseModel):
    ip: str

class ChatMessageCreate(BaseModel):
    session_id: str
    content: str = ""
    visitor_name: str = ""
    visitor_phone: str = ""
    client_message_id: str = ""

class ChatSessionCreate(BaseModel):
    session_id: str
    visitor_name: str
    visitor_phone: str

class AdminChatReply(BaseModel):
    content: str = ""
    client_message_id: str = ""

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8985091533:AAE72fpF3qP7tZ9Az9JVEQZ2YNuUwE6rIUk")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "8500753537")

# ==========================================
# 优化 1: 智能高可用 IP 拦截中间件 (双重接口 + 故障放行)
# ==========================================
@app.middleware("http")
async def ip_block_middleware(request: Request, call_next):
    # 核心优化 3：预检请求放行。
    # 确保浏览器能顺利解析后方真实的 403 报错状态码，保证前端正常触发强制跳转机制！
    if request.method == "OPTIONS":
        return await call_next(request)

    ip = request.headers.get("x-forwarded-for", request.client.host).split(",")[0].strip()
    path = request.url.path
    
    if not path.startswith("/api/"):
        return await call_next(request)

    ensure_mongo_context()

    if ip in ["127.0.0.1", "::1", "localhost"]:
        return await call_next(request)

    # 管理后台 API 不受地区限制，管理员可从全球任意地区登录
    if path.startswith("/api/admin/") or path == "/api/health":
        return await call_next(request)

    # 数据库不可用时直接放行，避免全站 500
    try:
        whitelist_entry = await whitelist_collection.find_one({"ip": ip})
        if whitelist_entry:
            return await call_next(request)
    except Exception:
        return await call_next(request)

    async def auto_whitelist(user_ip: str):
        try:
            await whitelist_collection.update_one(
                {"ip": user_ip},
                {"$setOnInsert": {"ip": user_ip, "added_at": datetime.utcnow().isoformat(), "auto_added": True}},
                upsert=True
            )
        except Exception:
            pass
        
    # 第二步：优先使用 Vercel 原生请求头 (零延迟、无API限流限制)
    vercel_country = request.headers.get("x-vercel-ip-country")
    if vercel_country:
        if vercel_country == "IL":
            await auto_whitelist(ip)
            return await call_next(request)
        else:
            return JSONResponse(status_code=403, content={"detail": "Access Denied: 仅限以色列地区访问。"})

    # 第三步：备用方案 A (ip-api.com)
    try:
        async with httpx.AsyncClient() as http_client:
            res1 = await http_client.get(f"http://ip-api.com/json/{ip}", timeout=2.0)
            if res1.status_code == 200:
                data = res1.json()
                if data.get("status") == "success":
                    if data.get("countryCode") == "IL":
                        await auto_whitelist(ip)
                        return await call_next(request)
                    else:
                        return JSONResponse(status_code=403, content={"detail": "Access Denied: 仅限以色列地区访问。"})
    except Exception:
        pass # 发生错误（超时、封禁等），忽略并尝试备用方案 B

    # 第四步：备用方案 B (api.country.is - 另一个稳定的免费IP库)
    try:
        async with httpx.AsyncClient() as http_client:
            res2 = await http_client.get(f"https://api.country.is/{ip}", timeout=2.0)
            if res2.status_code == 200:
                data = res2.json()
                if data.get("country") == "IL":
                    await auto_whitelist(ip)
                    return await call_next(request)
                else:
                    return JSONResponse(status_code=403, content={"detail": "Access Denied: 仅限以色列地区访问。"})
    except Exception:
        pass # 备用方案也失败

    # 第五步：终极兜底方案 (Fail-Open)
    # 如果所有的外部 API 服务都崩溃或限流了，我们选择不拦截，直接放行，确保你的客户能正常交易！
    return await call_next(request)


@app.post("/api/admin/check-path")
async def check_admin_path(data: PathCheckRequest):
    await asyncio.sleep(0.5)
    config = await get_config_doc()
    real_path = resolve_admin_path(config)
    normalized_req = "/" + data.path.strip("/")
    normalized_real = "/" + real_path.strip("/")
    return {"is_admin": normalized_req == normalized_real}

@app.post("/api/admin/login")
async def admin_login(data: LoginRequest):
    await asyncio.sleep(1.5)
    config = await get_config_doc()
    real_password = config.get("adminPassword", DEFAULT_ADMIN_PASSWORD)
    
    if data.password != real_password:
        raise HTTPException(status_code=401, detail="访问密钥错误 (Invalid Access Key)")
    
    token = jwt.encode({"sub": "admin", "exp": datetime.utcnow() + timedelta(hours=24)}, JWT_SECRET, algorithm="HS256")
    return {"token": token}

@app.get("/api/health")
async def health_check():
    db_ok = await ping_database()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "mongo_configured": bool(os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URI")),
        "error": _last_db_error if not db_ok else None,
        "hint": (
            "请在 MongoDB Atlas → Network Access 添加 0.0.0.0/0 允许 Vercel 访问"
            if not db_ok else None
        ),
    }

@app.get("/api/config")
async def get_public_config():
    config = await get_config_doc()
    return {
        "buyRate": config.get("buyRate", 4.4),
        "sellRate": config.get("sellRate", 3.3),
        "whatsappLink": config.get("whatsappLink", "https://wa.me/972552452669")
    }

@app.get("/api/admin/config")
async def get_admin_config(token_data: dict = Depends(verify_token)):
    config = await get_config_doc()
    return AdminConfig(
        buyRate=config.get("buyRate", 4.4),
        sellRate=config.get("sellRate", 3.3),
        whatsappLink=config.get("whatsappLink", "https://wa.me/972552452669"),
        adminPath=resolve_admin_path(config),
        adminPassword=config.get("adminPassword", DEFAULT_ADMIN_PASSWORD)
    )

@app.post("/api/admin/config")
async def update_admin_config(config: AdminConfig, token_data: dict = Depends(verify_token)):
    config_data = config.model_dump() if hasattr(config, 'model_dump') else config.dict()
    new_path = config_data["adminPath"]
    if not new_path.startswith("/"):
        new_path = "/" + new_path
        
    forbidden_prefixes = ["/api", "/static", "/frontend"]
    for fp in forbidden_prefixes:
        if new_path.startswith(fp) or new_path == "/":
            raise HTTPException(status_code=400, detail=f"安全拦截：禁止使用系统保留路由 '{fp}' 作为后台地址。")
            
    if len(config_data["adminPassword"]) < 6:
        raise HTTPException(status_code=400, detail="安全拦截：后台密码不得少于 6 个字符。")
            
    config_data["adminPath"] = new_path
        
    await config_collection.update_one({}, {"$set": config_data}, upsert=True)
    return {"message": "配置更新成功并已生效"}

# ==========================================
# 白名单管理 API (供后台页面调用)
# ==========================================
@app.get("/api/admin/whitelist")
async def get_whitelist(token_data: dict = Depends(verify_token)):
    cursor = whitelist_collection.find({}, {"_id": 0}).sort("added_at", -1)
    ips = await cursor.to_list(length=1000)
    return {"whitelist": ips}

@app.post("/api/admin/whitelist")
async def add_whitelist_ip(data: WhitelistIP, token_data: dict = Depends(verify_token)):
    await whitelist_collection.update_one(
        {"ip": data.ip}, 
        {"$set": {"ip": data.ip, "auto_added": False, "added_at": datetime.utcnow().isoformat()}}, 
        upsert=True
    )
    return {"message": "IP 已成功加入白名单"}

@app.delete("/api/admin/whitelist/{ip}")
async def remove_whitelist_ip(ip: str, token_data: dict = Depends(verify_token)):
    await whitelist_collection.delete_one({"ip": ip})
    return {"message": "IP 已从白名单移除"}

# ==========================================
# 在线聊天系统 API
# ==========================================
def get_client_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", request.client.host).split(",")[0].strip()

def validate_israeli_phone(phone: str) -> str:
    cleaned = re.sub(r"[\s\-()]", "", phone.strip())
    if cleaned.startswith("+972"):
        cleaned = "0" + cleaned[4:]
    elif cleaned.startswith("972"):
        cleaned = "0" + cleaned[3:]
    if not re.match(r"^05\d{8}$", cleaned):
        raise HTTPException(status_code=400, detail="请输入有效的以色列手机号码 (05XXXXXXXX)")
    return cleaned

def serialize_message(doc: dict) -> dict:
    msg = {k: v for k, v in doc.items() if k != "_id"}
    if msg.get("image_id"):
        msg["image_url"] = f"/api/chat/images/{msg['image_id']}"
    return msg

async def send_telegram(text: str):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json={"chat_id": TELEGRAM_CHAT_ID, "text": text}, timeout=10.0)
        except Exception:
            pass

async def notify_new_session(visitor_name: str, visitor_phone: str, session_id: str):
    text = (
        f"🆕 新聊天会话\n\n"
        f"姓名：{visitor_name}\n"
        f"手机：{visitor_phone}\n"
        f"会话：{session_id[:8]}..."
    )
    await send_telegram(text)

async def notify_new_message(visitor_name: str, visitor_phone: str, preview: str, session_id: str, msg_type: str = "text"):
    label = "📷 图片消息" if msg_type == "image" else "💬 新聊天消息"
    text = (
        f"{label}\n\n"
        f"姓名：{visitor_name}\n"
        f"手机：{visitor_phone}\n"
        f"会话：{session_id[:8]}...\n"
        f"内容：{preview[:200]}"
    )
    await send_telegram(text)

async def ensure_session(session_id: str, visitor_name: str, visitor_phone: str, ip: str):
    now = datetime.utcnow().isoformat()
    result = await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "visitor_name": visitor_name,
                "visitor_phone": visitor_phone,
                "visitor_ip": ip,
            },
            "$setOnInsert": {
                "session_id": session_id,
                "created_at": now,
                "last_message_at": now,
                "last_message": "",
                "unread_admin": 0,
                "unread_visitor": 0,
            },
        },
        upsert=True,
    )
    session = await chat_sessions_collection.find_one({"session_id": session_id}, {"_id": 0})
    is_new = result.upserted_id is not None
    return session, is_new

async def save_image_original(file_bytes: bytes, filename: str, mime_type: str, session_id: str) -> str:
    image_id = str(uuid.uuid4())
    await chat_images_fs.upload_from_stream(
        image_id,
        file_bytes,
        metadata={
            "session_id": session_id,
            "filename": filename,
            "mime_type": mime_type,
            "size": len(file_bytes),
            "uploaded_at": datetime.utcnow().isoformat(),
        },
    )
    return image_id

async def delete_image_by_name(image_id: str):
    files = await chat_images_fs.find({"filename": image_id}).to_list(1)
    if files:
        await chat_images_fs.delete(files[0]._id)

async def get_image_by_id(image_id: str):
    try:
        stream = await chat_images_fs.open_download_stream_by_name(image_id)
        data = await stream.read()
        meta = await chat_images_fs.find({"filename": image_id}).to_list(1)
        mime = meta[0].metadata.get("mime_type", "application/octet-stream") if meta else "application/octet-stream"
        filename = meta[0].metadata.get("filename", "image") if meta else "image"
        return data, mime, filename
    except Exception:
        return None, None, None

async def create_message_record(
    session_id: str,
    sender: str,
    msg_type: str,
    content: str,
    client_message_id: str = "",
    image_id: str = "",
    filename: str = "",
    mime_type: str = "",
) -> dict:
    ensure_mongo_context()
    if client_message_id:
        existing = await chat_messages_collection.find_one(
            {"session_id": session_id, "client_message_id": client_message_id},
            {"_id": 0},
        )
        if existing:
            return serialize_message(existing)

    now = datetime.utcnow().isoformat()
    message_id = str(uuid.uuid4())
    preview = content[:100] if content else ("[图片]" if msg_type == "image" else "")
    if msg_type == "image" and filename:
        preview = f"[图片] {filename}"

    message = {
        "message_id": message_id,
        "session_id": session_id,
        "sender": sender,
        "type": msg_type,
        "content": content,
        "created_at": now,
    }
    if client_message_id:
        message["client_message_id"] = client_message_id
    if image_id:
        message["image_id"] = image_id
        message["filename"] = filename
        message["mime_type"] = mime_type

    try:
        await chat_messages_collection.insert_one(message)
    except Exception:
        if client_message_id:
            existing = await chat_messages_collection.find_one(
                {"session_id": session_id, "client_message_id": client_message_id},
                {"_id": 0},
            )
            if existing:
                return serialize_message(existing)
        raise
    inc_field = "unread_admin" if sender == "visitor" else "unread_visitor"
    await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {
            "$set": {"last_message_at": now, "last_message": preview[:100]},
            "$inc": {inc_field: 1},
            "$setOnInsert": {
                "session_id": session_id,
                "visitor_name": "访客",
                "visitor_phone": "",
                "visitor_ip": "",
                "created_at": now,
                "unread_admin": 0,
                "unread_visitor": 0,
            },
        },
        upsert=True,
    )
    return serialize_message(message)

@app.post("/api/chat/session")
async def create_or_get_chat_session(
    request: Request,
    data: ChatSessionCreate,
    background_tasks: BackgroundTasks,
):
    ensure_mongo_context()
    try:
        session_id = data.session_id.strip()
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")

        visitor_name = data.visitor_name.strip()
        if not visitor_name or len(visitor_name) < 2:
            raise HTTPException(status_code=400, detail="请输入您的姓名")

        visitor_phone = validate_israeli_phone(data.visitor_phone)
        ip = get_client_ip(request)

        session, is_new = await ensure_session(session_id, visitor_name, visitor_phone, ip)
        if not session:
            raise HTTPException(status_code=500, detail="会话创建失败，请重试")

        if is_new:
            background_tasks.add_task(notify_new_session, visitor_name, visitor_phone, session_id)

        return {
            "session_id": session["session_id"],
            "visitor_name": session.get("visitor_name", visitor_name),
            "visitor_phone": session.get("visitor_phone", visitor_phone),
            "unread_visitor": session.get("unread_visitor", 0),
        }
    except HTTPException:
        raise
    except Exception as e:
        if not os.environ.get("MONGO_URL"):
            raise HTTPException(status_code=503, detail="数据库未配置，请在 Vercel 设置 MONGO_URL 环境变量")
        raise HTTPException(status_code=503, detail="数据库连接失败，请稍后重试")

@app.get("/api/chat/sync")
async def sync_visitor_chat(session_id: str = Query(...)):
    """访客打开网站时同步未读消息（不重置未读数）"""
    ensure_mongo_context()
    session = await chat_sessions_collection.find_one({"session_id": session_id}, {"_id": 0})
    cursor = chat_messages_collection.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1)
    messages = [serialize_message(m) for m in await cursor.to_list(length=2000)]
    return {
        "unread_visitor": session.get("unread_visitor", 0) if session else 0,
        "messages": messages,
    }

@app.get("/api/chat/messages")
async def get_visitor_messages(
    session_id: str = Query(...),
    since: str = Query(None),
):
    ensure_mongo_context()
    query = {"session_id": session_id}
    if since:
        query["created_at"] = {"$gt": since}

    cursor = chat_messages_collection.find(query, {"_id": 0}).sort("created_at", 1)
    messages = [serialize_message(m) for m in await cursor.to_list(length=2000)]

    await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {"$set": {"unread_visitor": 0}},
    )

    return {"messages": messages}

@app.post("/api/chat/messages")
async def send_visitor_message(
    request: Request,
    data: ChatMessageCreate,
    background_tasks: BackgroundTasks,
):
    ensure_mongo_context()
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="消息内容不能为空")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="消息过长")

    session_id = data.session_id.strip()
    visitor_name = data.visitor_name.strip()
    visitor_phone = validate_israeli_phone(data.visitor_phone) if data.visitor_phone else ""
    ip = get_client_ip(request)

    session = await chat_sessions_collection.find_one({"session_id": session_id})
    if not session:
        if not visitor_name or not visitor_phone:
            raise HTTPException(status_code=400, detail="请先完成姓名和手机号验证")
        session, _ = await ensure_session(session_id, visitor_name, visitor_phone, ip)
    else:
        visitor_name = visitor_name or session.get("visitor_name", "")
        visitor_phone = visitor_phone or session.get("visitor_phone", "")

    message = await create_message_record(
        session_id, "visitor", "text", content, data.client_message_id
    )
    if message.get("client_message_id") is None and data.client_message_id:
        message["client_message_id"] = data.client_message_id
    background_tasks.add_task(
        notify_new_message, visitor_name, visitor_phone, content, session_id, "text"
    )
    return {"message": message}

@app.post("/api/chat/upload")
async def upload_visitor_image(
    request: Request,
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    content: str = Form(""),
    visitor_name: str = Form(""),
    visitor_phone: str = Form(""),
    client_message_id: str = Form(""),
):
    if not file.content_type or file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="仅支持图片格式 (JPEG/PNG/GIF/WebP/HEIC)")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(file_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="图片不能超过 20MB")

    session_id = session_id.strip()
    ip = get_client_ip(request)
    session = await chat_sessions_collection.find_one({"session_id": session_id})
    vname = visitor_name.strip()
    vphone = validate_israeli_phone(visitor_phone) if visitor_phone else ""

    if not session:
        if not vname or not vphone:
            raise HTTPException(status_code=400, detail="请先完成姓名和手机号验证")
        session, _ = await ensure_session(session_id, vname, vphone, ip)
    else:
        vname = vname or session.get("visitor_name", "")
        vphone = vphone or session.get("visitor_phone", "")

    filename = file.filename or "image.jpg"
    image_id = await save_image_original(file_bytes, filename, file.content_type, session_id)

    message = await create_message_record(
        session_id, "visitor", "image", content.strip(),
        client_message_id, image_id, filename, file.content_type,
    )
    background_tasks.add_task(
        notify_new_message, vname, vphone, f"[图片] {filename}", session_id, "image"
    )
    return {"message": message}

@app.get("/api/chat/images/{image_id}")
async def serve_chat_image(image_id: str):
    data, mime, filename = await get_image_by_id(image_id)
    if not data:
        raise HTTPException(status_code=404, detail="图片不存在")
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "public, max-age=31536000"},
    )

@app.get("/api/admin/chat/sessions")
async def get_chat_sessions(token_data: dict = Depends(verify_token)):
    ensure_mongo_context()
    cursor = chat_sessions_collection.find({}, {"_id": 0}).sort("last_message_at", -1)
    sessions = await cursor.to_list(length=200)
    return {"sessions": sessions}

@app.get("/api/admin/chat/sessions/{session_id}/messages")
async def get_admin_session_messages(
    session_id: str,
    since: str = Query(None),
    token_data: dict = Depends(verify_token),
):
    ensure_mongo_context()
    query = {"session_id": session_id}
    if since:
        query["created_at"] = {"$gt": since}

    cursor = chat_messages_collection.find(query, {"_id": 0}).sort("created_at", 1)
    messages = [serialize_message(m) for m in await cursor.to_list(length=2000)]

    await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {"$set": {"unread_admin": 0}},
    )
    return {"messages": messages}

@app.post("/api/admin/chat/sessions/{session_id}/messages")
async def send_admin_reply(
    session_id: str,
    data: AdminChatReply,
    token_data: dict = Depends(verify_token),
):
    ensure_mongo_context()
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="消息内容不能为空")

    session = await chat_sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    message = await create_message_record(
        session_id, "admin", "text", content, data.client_message_id
    )
    if message.get("client_message_id") is None and data.client_message_id:
        message["client_message_id"] = data.client_message_id
    return {"message": message}

@app.post("/api/admin/chat/sessions/{session_id}/upload")
async def upload_admin_image(
    session_id: str,
    file: UploadFile = File(...),
    content: str = Form(""),
    client_message_id: str = Form(""),
    token_data: dict = Depends(verify_token),
):
    ensure_mongo_context()
    if not file.content_type or file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="仅支持图片格式")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(file_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="图片不能超过 20MB")

    session = await chat_sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    filename = file.filename or "image.jpg"
    image_id = await save_image_original(file_bytes, filename, file.content_type, session_id)
    message = await create_message_record(
        session_id, "admin", "image", content.strip(),
        client_message_id, image_id, filename, file.content_type,
    )
    if message.get("client_message_id") is None and client_message_id:
        message["client_message_id"] = client_message_id
    return {"message": message}

@app.delete("/api/admin/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, token_data: dict = Depends(verify_token)):
    img_msgs = await chat_messages_collection.find(
        {"session_id": session_id, "type": "image"}, {"image_id": 1}
    ).to_list(500)
    for msg in img_msgs:
        if msg.get("image_id"):
            try:
                await delete_image_by_name(msg["image_id"])
            except Exception:
                pass

    await chat_messages_collection.delete_many({"session_id": session_id})
    result = await chat_sessions_collection.delete_one({"session_id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"message": "会话已删除"}