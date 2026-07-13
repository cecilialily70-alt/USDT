import os
import re
import ipaddress
import logging
import certifi
import asyncio
import hashlib
import hmac
import uuid
import httpx
import time
import bcrypt
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
from fastapi import FastAPI, Request, HTTPException, Depends, BackgroundTasks, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field
import jwt
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager
from typing import Optional
from pymongo import ReturnDocument

logger = logging.getLogger("exchange")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

# ==========================================
# 优化 3: 数据库性能优化 (启动时创建索引)
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await ensure_indexes()
    except Exception as e:
        logger.error("ensure_indexes failed on startup: %s", e)
    yield

app = FastAPI(lifespan=lifespan)

VERCEL_ENV = (os.environ.get("VERCEL_ENV") or "").strip().lower()
IS_PRODUCTION = VERCEL_ENV == "production" or os.environ.get("ENV") == "production"

# ==========================================
# 优化 2: 严格的 CORS 限制 (保护你的专属域名)
# Preview: also allow https://*.vercel.app
# ==========================================
_cors_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "https://www.ils-usdt.xyz",
    "https://ils-usdt.xyz",
]
# Extra origins: CORS_ORIGINS=https://a.com,https://b.com
for _o in (os.environ.get("CORS_ORIGINS") or "").split(","):
    _o = _o.strip().rstrip("/")
    if _o and _o not in _cors_origins:
        _cors_origins.append(_o)
# Auto-allow this deployment's Vercel URL (production + preview)
_vercel_url = (os.environ.get("VERCEL_URL") or "").strip()
if _vercel_url:
    _vu = _vercel_url if _vercel_url.startswith("http") else f"https://{_vercel_url}"
    _vu = _vu.rstrip("/")
    if _vu not in _cors_origins:
        _cors_origins.append(_vu)

_cors_kwargs = {
    "allow_origins": _cors_origins,
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Authorization", "Content-Type", "X-Visitor-Phone"],
}
if VERCEL_ENV in ("preview", "production"):
    # Preview + *.vercel.app production aliases
    _cors_kwargs["allow_origin_regex"] = r"^https://[\w.-]+\.vercel\.app$"
app.add_middleware(CORSMiddleware, **_cors_kwargs)

MONGO_URL = (
    os.environ.get("MONGO_URL")
    or os.environ.get("MONGODB_URI")
    or "mongodb://localhost:27017"
).strip().strip('"').strip("'")

JWT_SECRET = (os.environ.get("JWT_SECRET") or "").strip()
if not JWT_SECRET:
    logger.warning(
        "JWT_SECRET is not set. Admin JWT auth will fail until JWT_SECRET is configured in the environment."
    )
    JWT_SECRET = ""

# Dev-only fallbacks. Production MUST use MongoDB config (adminPath / hashed adminPassword).
DEFAULT_ADMIN_PATH = "/admin-dev"
DEFAULT_ADMIN_PASSWORD = "change-me-dev-only"
LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8
CHAT_RATE_LIMIT_WINDOW_SECONDS = 60
CHAT_RATE_LIMIT_MAX_REQUESTS = 60
IMAGE_URL_TTL_SECONDS = 15 * 60
COUNTRY_CACHE_TTL_SECONDS = 30 * 60
_country_cache: dict[str, tuple[str, float]] = {}
CHAT_RETENTION_HOURS = 72
CHAT_RETENTION_SECONDS = CHAT_RETENTION_HOURS * 60 * 60
NEW_SESSION_WELCOME_HE = "היי, שירות המרות (ביט/פייבוקס/משיכה ללא כרטיס). איך אפשר לעזור?"
WELCOME_MESSAGE_CLIENT_ID = "system:welcome"
CLEANUP_INTERVAL_SECONDS = 10 * 60
_last_cleanup_run_at = 0.0
_cleanup_lock = asyncio.Lock()

def normalize_admin_path(path: str) -> str:
    """Normalize admin URL path: leading slash, no trailing slash, case-insensitive."""
    p = "/" + (path or "").strip().strip("/")
    if p != "/":
        p = p.lower()
    return p


def resolve_admin_path(config: dict) -> str:
    env_path = os.environ.get("ADMIN_PATH", "").strip()
    return normalize_admin_path(
        config.get("adminPath") or env_path or DEFAULT_ADMIN_PATH
    )

def _signing_secret() -> bytes:
    secret = JWT_SECRET or os.environ.get("MONGO_URL") or "dev-insecure"
    return secret.encode("utf-8")

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def looks_like_bcrypt(value: str) -> bool:
    return bool(value) and value.startswith("$2") and len(value) >= 50

def verify_password(plain: str, stored: str) -> bool:
    if not plain or not stored:
        return False
    if looks_like_bcrypt(stored):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    # Legacy plaintext (migrate on next successful login / config save)
    return hmac.compare_digest(plain, stored)

def password_is_configured(config: dict) -> bool:
    stored = (config.get("adminPassword") or "").strip()
    if not stored:
        return False
    if stored == DEFAULT_ADMIN_PASSWORD:
        return False
    return True

def make_image_token(image_id: str, session_id: str, exp: Optional[int] = None) -> str:
    expires = exp or int(time.time()) + IMAGE_URL_TTL_SECONDS
    payload = f"{image_id}:{session_id}:{expires}"
    sig = hmac.new(_signing_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    return f"{expires}.{sig}"

def verify_image_token(image_id: str, session_id: str, token: str) -> bool:
    try:
        expires_s, sig = token.split(".", 1)
        expires = int(expires_s)
        if expires < int(time.time()):
            return False
        payload = f"{image_id}:{session_id}:{expires}"
        expected = hmac.new(_signing_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False

def signed_image_url(image_id: str, session_id: str) -> str:
    token = make_image_token(image_id, session_id)
    return f"/api/chat/images/{image_id}?session_id={session_id}&token={token}"

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
blacklist_collection = db.blacklist
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
    global mongo_client, db, config_collection, whitelist_collection, blacklist_collection
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
    blacklist_collection = db.blacklist
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
        (blacklist_collection, "ip", {"unique": True}),
        (chat_sessions_collection, "session_id", {"unique": True}),
        (chat_sessions_collection, [("last_message_at", -1)], {}),
        (chat_messages_collection, [("session_id", 1), ("created_at", 1)], {}),
        (chat_messages_collection, "created_at_dt", {"expireAfterSeconds": CHAT_RETENTION_SECONDS}),
        (chat_messages_collection, "message_id", {"unique": True}),
        (db.rate_limits, [("key", 1), ("window_start", 1)], {"unique": True}),
        (db.rate_limits, "expires_at", {"expireAfterSeconds": 0}),
    ]
    for collection, keys, opts in specs:
        try:
            await collection.create_index(keys, **opts)
        except Exception as e:
            logger.warning("create_index failed for %s %s: %s", getattr(collection, "name", collection), keys, e)
    try:
        await chat_messages_collection.create_index(
            [("session_id", 1), ("client_message_id", 1)],
            unique=True,
            partialFilterExpression={"client_message_id": {"$exists": True, "$type": "string"}},
        )
    except Exception as e:
        logger.warning("create_index failed for client_message_id: %s", e)
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

# Vercel serverless request body limit is ~4.5MB — keep under that for reliable uploads
MAX_IMAGE_SIZE = 4 * 1024 * 1024  # 4MB
ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/gif",
    "image/webp", "image/bmp",
}
IMAGE_TYPE_ERROR_DETAIL = "IMAGE_TYPE_NOT_SUPPORTED"

security = HTTPBearer()

def require_jwt_secret():
    if not JWT_SECRET:
        raise HTTPException(status_code=503, detail="JWT_SECRET_NOT_CONFIGURED")

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    require_jwt_secret()
    token = credentials.credentials
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="SESSION_EXPIRED")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="INVALID_TOKEN")

class PublicConfig(BaseModel):
    buyRate: float = 4.4
    sellRate: float = 3.3

class AdminConfigUpdate(PublicConfig):
    adminPath: str = DEFAULT_ADMIN_PATH
    adminPassword: str = Field(default="", description="Leave empty to keep current password")

class LoginRequest(BaseModel):
    password: str

class PathCheckRequest(BaseModel):
    path: str

class WhitelistIP(BaseModel):
    ip: str

class BlacklistIP(BaseModel):
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
    content_original: str = ""


class AdminTranslateRequest(BaseModel):
    text: str = ""
    target: str = "zh"  # zh | he
    provider: str = ""  # google | deepseek (optional)

def normalize_ip(raw: str) -> str:
    candidate = (raw or "").strip()
    if candidate.count(":") == 1 and "." in candidate:
        candidate = candidate.split(":")[0]
    if candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1:candidate.index("]")]
    try:
        ipaddress.ip_address(candidate)
        return candidate
    except Exception:
        return ""

def extract_related_ips(request: Request) -> list[str]:
    values = []
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        values.extend([p.strip() for p in forwarded.split(",") if p.strip()])
    for header in ("x-real-ip", "x-vercel-forwarded-for", "x-client-ip"):
        hv = request.headers.get(header, "")
        if hv:
            values.extend([p.strip() for p in hv.split(",") if p.strip()])
    if request.client and request.client.host:
        values.append(request.client.host)

    dedup = []
    for v in values:
        ip_val = normalize_ip(v)
        if ip_val and ip_val not in dedup:
            dedup.append(ip_val)
    return dedup

def get_client_ip(request: Request) -> str:
    return normalize_ip(request.headers.get("x-forwarded-for", request.client.host).split(",")[0].strip())

def require_valid_ip(value: str) -> str:
    ip = (value or "").strip()
    try:
        ipaddress.ip_address(ip)
    except Exception:
        raise HTTPException(status_code=400, detail="INVALID_IP_FORMAT")
    return ip

async def check_rate_limit(key: str, max_attempts: int, window_seconds: int, *, increment: bool = True) -> bool:
    """Return True if rate limited. Persisted in MongoDB for serverless."""
    ensure_mongo_context()
    now = datetime.utcnow()
    window_start = now.replace(second=0, microsecond=0)
    bucket_minutes = max(1, window_seconds // 60)
    minute = (window_start.minute // bucket_minutes) * bucket_minutes
    window_start = window_start.replace(minute=minute)
    expires_at = window_start + timedelta(seconds=window_seconds * 2)
    try:
        if increment:
            result = await db.rate_limits.find_one_and_update(
                {"key": key, "window_start": window_start},
                {
                    "$inc": {"count": 1},
                    "$setOnInsert": {"expires_at": expires_at},
                },
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            count = (result or {}).get("count", 1)
        else:
            result = await db.rate_limits.find_one({"key": key, "window_start": window_start})
            count = (result or {}).get("count", 0)
        return count >= max_attempts if not increment else count > max_attempts
    except Exception as e:
        logger.warning("rate_limit check failed for %s: %s", key, e)
        return False

async def is_login_rate_limited(ip: str) -> bool:
    return await check_rate_limit(
        f"login:{ip}",
        LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        increment=False,
    )

async def register_login_attempt(ip: str):
    await check_rate_limit(
        f"login:{ip}",
        LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        increment=True,
    )

async def clear_login_attempts(ip: str):
    ensure_mongo_context()
    try:
        await db.rate_limits.delete_many({"key": f"login:{ip}"})
    except Exception as e:
        logger.warning("clear_login_attempts failed: %s", e)

async def enforce_chat_rate_limit(request: Request):
    ip = get_client_ip(request) or "unknown"
    limited = await check_rate_limit(
        f"chat:{ip}",
        CHAT_RATE_LIMIT_MAX_REQUESTS,
        CHAT_RATE_LIMIT_WINDOW_SECONDS,
        increment=True,
    )
    if limited:
        raise HTTPException(status_code=429, detail="RATE_LIMITED")

def normalize_phone_digits(phone: str) -> str:
    cleaned = re.sub(r"[\s\-()]", "", (phone or "").strip())
    if cleaned.startswith("+972"):
        cleaned = "0" + cleaned[4:]
    elif cleaned.startswith("972"):
        cleaned = "0" + cleaned[3:]
    return cleaned

async def assert_visitor_session_access(
    session_id: str,
    visitor_phone: str = "",
    *,
    require_existing: bool = True,
) -> Optional[dict]:
    """Bind visitor reads/writes to session_id + registered phone."""
    session_id = (session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="SESSION_ID_REQUIRED")
    session = await chat_sessions_collection.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        if require_existing:
            raise HTTPException(status_code=404, detail="SESSION_NOT_FOUND")
        return None
    stored_phone = normalize_phone_digits(session.get("visitor_phone") or "")
    provided = normalize_phone_digits(visitor_phone)
    if not stored_phone:
        raise HTTPException(status_code=403, detail="SESSION_ACCESS_DENIED")
    if not provided or not hmac.compare_digest(stored_phone, provided):
        raise HTTPException(status_code=403, detail="SESSION_ACCESS_DENIED")
    return session

def visitor_phone_from_request(request: Request, explicit: str = "") -> str:
    return (explicit or request.headers.get("X-Visitor-Phone") or request.query_params.get("visitor_phone") or "").strip()

ACCESS_DENIED_HK_DETAIL = "ACCESS_DENIED_REGION"

def get_cached_country(ip_value: str) -> str:
    cached = _country_cache.get(ip_value)
    if not cached:
        return ""
    country_code, expires_at = cached
    if time.time() > expires_at:
        _country_cache.pop(ip_value, None)
        return ""
    return country_code

def set_cached_country(ip_value: str, country_code: str):
    if not ip_value or not country_code:
        return
    _country_cache[ip_value] = (country_code, time.time() + COUNTRY_CACHE_TTL_SECONDS)

async def auto_whitelist_many(candidates: list[str], source: str):
    """
    将候选 IP 写入 Mongo 白名单（仅 auto_added）。
    注意：调用方通常已确保 ensure_mongo_context()。
    """
    try:
        ensure_mongo_context()
        now = datetime.utcnow().isoformat()
        for user_ip in candidates:
            if user_ip in ["127.0.0.1", "::1", "localhost"]:
                continue
            await whitelist_collection.update_one(
                {"ip": user_ip},
                {
                    "$setOnInsert": {
                        "ip": user_ip,
                        "added_at": now,
                        "auto_added": True,
                        "source": source,
                    }
                },
                upsert=True,
            )
    except Exception:
        # 安全策略失败要 fail-open，避免误伤用户
        pass

async def apply_country_policy_and_maybe_block(
    request: Request,
    ip: str,
    related_ips: list[str],
):
    """
    仅拦截香港：如果为 HK 则返回 JSONResponse，否则写入 auto 白名单并返回 None。
    最终失败兜底：fail-open（返回 None）。
    """
    candidates = related_ips or [ip]

    # 1) Vercel header 最高优先级
    vercel_country = request.headers.get("x-vercel-ip-country")
    if vercel_country:
        set_cached_country(ip, vercel_country)
        if vercel_country == "HK":
            return JSONResponse(status_code=403, content={"detail": ACCESS_DENIED_HK_DETAIL})
        await auto_whitelist_many(candidates, "vercel-header")
        return None

    # 2) 命中缓存
    cached_country = get_cached_country(ip)
    if cached_country:
        if cached_country == "HK":
            return JSONResponse(status_code=403, content={"detail": ACCESS_DENIED_HK_DETAIL})
        await auto_whitelist_many(candidates, "country-cache")
        return None

    # 上传/发送写操作：避免外部 IP 查询拖慢请求（这里宁可 fail-open）
    path = request.url.path
    is_chat_write = (
        path in {"/api/chat/upload", "/api/chat/messages"} or
        (path.startswith("/api/admin/chat/sessions/") and (path.endswith("/upload") or path.endswith("/messages")))
    )
    if is_chat_write:
        return None

    # 3) 外部 IP 库 A
    try:
        async with httpx.AsyncClient() as http_client:
            res1 = await http_client.get(f"http://ip-api.com/json/{ip}", timeout=2.0)
            if res1.status_code == 200:
                data = res1.json()
                if data.get("status") == "success":
                    country = data.get("countryCode")
                    if country:
                        set_cached_country(ip, country)
                    if country == "HK":
                        return JSONResponse(status_code=403, content={"detail": ACCESS_DENIED_HK_DETAIL})
                    await auto_whitelist_many(candidates, "ip-api")
                    return None
    except Exception:
        pass

    # 4) 外部 IP 库 B
    try:
        async with httpx.AsyncClient() as http_client:
            res2 = await http_client.get(f"https://api.country.is/{ip}", timeout=2.0)
            if res2.status_code == 200:
                data = res2.json()
                country = data.get("country")
                if country:
                    set_cached_country(ip, country)
                if country == "HK":
                    return JSONResponse(status_code=403, content={"detail": ACCESS_DENIED_HK_DETAIL})
                await auto_whitelist_many(candidates, "country-is")
                return None
    except Exception:
        pass

    # 5) fail-open
    return None

def _parse_iso_datetime(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            dt = value
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        return dt.replace(tzinfo=None)
    except Exception:
        return None

def _session_last_activity(session: dict) -> Optional[datetime]:
    """Latest of last_message_at, last_seen_at, created_at (naive UTC)."""
    times = []
    for key in ("last_message_at", "last_seen_at", "created_at"):
        dt = _parse_iso_datetime(session.get(key))
        if dt is not None:
            times.append(dt)
    return max(times) if times else None

async def delete_session_completely(session_id: str) -> bool:
    """Remove one session and all related messages + GridFS images."""
    if not session_id:
        return False
    ensure_mongo_context()
    img_msgs = await chat_messages_collection.find(
        {"session_id": session_id, "type": "image"}, {"image_id": 1}
    ).to_list(500)
    for msg in img_msgs:
        image_id = msg.get("image_id")
        if image_id:
            try:
                await delete_image_by_name(image_id)
            except Exception as e:
                logger.warning("delete session image %s failed: %s", image_id, e)

    await chat_messages_collection.delete_many({"session_id": session_id})
    result = await chat_sessions_collection.delete_one({"session_id": session_id})
    return result.deleted_count > 0

async def cleanup_expired_chat_data():
    ensure_mongo_context()
    cutoff_dt = datetime.utcnow() - timedelta(hours=CHAT_RETENTION_HOURS)

    # 1) Drop entire sessions with no interaction for 72+ hours
    sessions = await chat_sessions_collection.find(
        {},
        {"session_id": 1, "last_message_at": 1, "last_seen_at": 1, "created_at": 1},
    ).to_list(length=5000)
    for session in sessions:
        sid = session.get("session_id")
        if not sid:
            continue
        last_activity = _session_last_activity(session)
        if last_activity is None or last_activity >= cutoff_dt:
            continue
        try:
            await delete_session_completely(sid)
        except Exception as e:
            logger.warning("delete stale session %s failed: %s", sid, e)

    # 2) Safety net: purge orphan messages / images older than retention
    old_img_msgs = await chat_messages_collection.find(
        {"type": "image", "created_at_dt": {"$lt": cutoff_dt}},
        {"image_id": 1},
    ).to_list(length=5000)
    seen_images = set()
    for msg in old_img_msgs:
        image_id = msg.get("image_id")
        if image_id and image_id not in seen_images:
            seen_images.add(image_id)
            try:
                await delete_image_by_name(image_id)
            except Exception as e:
                logger.warning("delete expired image %s failed: %s", image_id, e)

    await chat_messages_collection.delete_many({"created_at_dt": {"$lt": cutoff_dt}})

    try:
        old_files = await db["chat_images.files"].find(
            {"uploadDate": {"$lt": cutoff_dt}},
            {"_id": 1},
        ).to_list(length=2000)
        for f in old_files:
            try:
                await chat_images_fs.delete(f["_id"])
            except Exception as e:
                logger.warning("orphan GridFS delete failed: %s", e)
    except Exception as e:
        logger.warning("orphan GridFS scan failed: %s", e)

    # 3) Remove session rows left without messages (legacy / edge cases)
    # Use Z-suffixed ISO so lexicographic compare matches utc_now_iso() storage format.
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(hours=CHAT_RETENTION_HOURS)).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")
    stale_sessions = await chat_sessions_collection.find(
        {"last_message_at": {"$lt": cutoff_iso}},
        {"session_id": 1},
    ).to_list(length=2000)
    for s in stale_sessions:
        sid = s.get("session_id")
        if not sid:
            continue
        remaining = await chat_messages_collection.find_one({"session_id": sid}, {"_id": 1})
        if remaining is None:
            await chat_sessions_collection.delete_one({"session_id": sid})

async def maybe_cleanup_expired_chat_data():
    global _last_cleanup_run_at
    now = time.time()
    if now - _last_cleanup_run_at < CLEANUP_INTERVAL_SECONDS:
        return
    if _cleanup_lock.locked():
        return
    async with _cleanup_lock:
        now2 = time.time()
        if now2 - _last_cleanup_run_at < CLEANUP_INTERVAL_SECONDS:
            return
        try:
            await cleanup_expired_chat_data()
        except Exception as e:
            logger.error("cleanup_expired_chat_data failed: %s", e)
        _last_cleanup_run_at = time.time()

def resolve_image_mime(filename: str, content_type: str) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ALLOWED_IMAGE_TYPES:
        return ct
    ext = os.path.splitext(filename or "")[1].lower().lstrip(".")
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
        "bmp": "image/bmp",
    }.get(ext, "")

async def read_and_validate_image(file: UploadFile) -> tuple[bytes, str]:
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="EMPTY_FILE")
    mime_type = resolve_image_mime(file.filename or "", file.content_type or "")
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=IMAGE_TYPE_ERROR_DETAIL)
    if len(file_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="IMAGE_TOO_LARGE")
    return file_bytes, mime_type

TELEGRAM_BOT_TOKEN = (
    os.environ.get("TG_BOT")
    or os.environ.get("TELEGRAM_BOT_TOKEN")
    or ""
).strip()
TELEGRAM_CHAT_ID = (
    os.environ.get("TG_CHAT_ID")
    or os.environ.get("TELEGRAM_CHAT_ID")
    or ""
).strip()

# ==========================================
# 优化 1: 智能高可用 IP 拦截中间件 (双重接口 + 故障放行)
# ==========================================
@app.middleware("http")
async def ip_block_middleware(request: Request, call_next):
    # 核心优化 3：预检请求放行。
    # 确保浏览器能顺利解析后方真实的 403 报错状态码，保证前端正常触发强制跳转机制！
    if request.method == "OPTIONS":
        return await call_next(request)

    related_ips = extract_related_ips(request)
    ip = related_ips[0] if related_ips else normalize_ip(request.client.host if request.client else "")
    path = request.url.path
    
    if not path.startswith("/api/"):
        return await call_next(request)

    ensure_mongo_context()

    if not ip:
        # 无法识别来源 IP 时快速放行，避免阻塞正常业务
        return await call_next(request)

    if ip in ["127.0.0.1", "::1", "localhost"]:
        return await call_next(request)

    # 聊天系统对用户体验来说必须稳定：
    # 1) 不做地区限制（不调用外部 IP 地理库）
    # 2) 仅检查黑名单（后台可拉黑刷屏用户）
    if path.startswith("/api/admin/") or path == "/api/health":
        return await call_next(request)

    if path.startswith("/api/chat/"):
        try:
            blocked = await blacklist_collection.find_one(
                {"ip": {"$in": related_ips or [ip]}},
                {"_id": 0},
            )
            if blocked:
                return JSONResponse(status_code=403, content={"detail": "BLACKLISTED"})
        except Exception:
            # 黑名单查询失败时 fail-open，避免误伤
            pass
        return await call_next(request)

    # 数据库不可用时直接放行，避免全站 500
    try:
        whitelist_entry = await whitelist_collection.find_one({"ip": {"$in": related_ips or [ip]}})
        if whitelist_entry:
            return await call_next(request)
    except Exception:
        return await call_next(request)

    blocked_response = await apply_country_policy_and_maybe_block(request, ip, related_ips)
    if blocked_response is not None:
        return blocked_response
    return await call_next(request)

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    await maybe_cleanup_expired_chat_data()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


@app.post("/api/admin/check-path")
async def check_admin_path(data: PathCheckRequest):
    await asyncio.sleep(0.5)
    config = await get_config_doc()
    real_path = resolve_admin_path(config)
    # Case-insensitive: mobile keyboards often capitalize the first letter.
    return {
        "is_admin": normalize_admin_path(data.path) == normalize_admin_path(real_path)
    }

@app.post("/api/admin/login")
async def admin_login(data: LoginRequest, request: Request):
    await asyncio.sleep(1.5)
    ip = get_client_ip(request)
    if await is_login_rate_limited(ip):
        raise HTTPException(status_code=429, detail="RATE_LIMITED")
    require_jwt_secret()
    config = await get_config_doc()
    stored_password = config.get("adminPassword") or ""
    if not stored_password:
        stored_password = DEFAULT_ADMIN_PASSWORD

    if IS_PRODUCTION:
        if not stored_password or stored_password == DEFAULT_ADMIN_PASSWORD or not password_is_configured(config):
            raise HTTPException(status_code=503, detail="DEFAULT_PASSWORD_FORBIDDEN")

    if not verify_password(data.password, stored_password):
        await register_login_attempt(ip)
        raise HTTPException(status_code=401, detail="INVALID_ACCESS_KEY")

    # Migrate legacy plaintext password to bcrypt on successful login
    if stored_password and not looks_like_bcrypt(stored_password):
        try:
            await config_collection.update_one(
                {},
                {"$set": {"adminPassword": hash_password(data.password)}},
                upsert=True,
            )
        except Exception as e:
            logger.warning("password hash migration failed: %s", e)

    await clear_login_attempts(ip)
    token = jwt.encode({"sub": "admin", "exp": datetime.utcnow() + timedelta(hours=24)}, JWT_SECRET, algorithm="HS256")
    return {"token": token}

@app.get("/api/health")
async def health_check():
    db_ok = await ping_database()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
    }

@app.get("/api/config")
async def get_public_config():
    config = await get_config_doc()
    return {
        "buyRate": config.get("buyRate", 4.4),
        "sellRate": config.get("sellRate", 3.3),
    }

@app.get("/api/admin/config")
async def get_admin_config(token_data: dict = Depends(verify_token)):
    config = await get_config_doc()
    return {
        "buyRate": config.get("buyRate", 4.4),
        "sellRate": config.get("sellRate", 3.3),
        "adminPath": resolve_admin_path(config),
        "adminPassword": "",
        "passwordSet": password_is_configured(config),
    }

@app.post("/api/admin/config")
async def update_admin_config(config: AdminConfigUpdate, token_data: dict = Depends(verify_token)):
    config_data = config.model_dump() if hasattr(config, 'model_dump') else config.dict()
    new_path = normalize_admin_path(config_data["adminPath"])

    forbidden_prefixes = ["/api", "/static", "/frontend"]
    for fp in forbidden_prefixes:
        if new_path.startswith(fp) or new_path == "/":
            raise HTTPException(status_code=400, detail="RESERVED_ADMIN_PATH")

    existing = await get_config_doc()
    plain_password = (config_data.get("adminPassword") or "").strip()
    if plain_password:
        if len(plain_password) < 6:
            raise HTTPException(status_code=400, detail="PASSWORD_TOO_SHORT")
        if plain_password == DEFAULT_ADMIN_PASSWORD and IS_PRODUCTION:
            raise HTTPException(status_code=400, detail="DEFAULT_PASSWORD_FORBIDDEN")
        config_data["adminPassword"] = hash_password(plain_password)
    else:
        # Keep existing hashed/plaintext password
        if existing.get("adminPassword"):
            config_data["adminPassword"] = existing["adminPassword"]
        else:
            raise HTTPException(status_code=400, detail="PASSWORD_TOO_SHORT")

    config_data["adminPath"] = new_path
    await config_collection.update_one({}, {"$set": config_data}, upsert=True)
    return {"message": "CONFIG_SAVED"}

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
    valid_ip = require_valid_ip(data.ip)
    await whitelist_collection.update_one(
        {"ip": valid_ip}, 
        {"$set": {"ip": valid_ip, "auto_added": False, "added_at": datetime.utcnow().isoformat(), "source": "manual"}}, 
        upsert=True
    )
    return {"message": "WHITELIST_ADDED"}

@app.delete("/api/admin/whitelist/{ip}")
async def remove_whitelist_ip(ip: str, token_data: dict = Depends(verify_token)):
    valid_ip = require_valid_ip(ip)
    await whitelist_collection.delete_one({"ip": valid_ip})
    return {"message": "WHITELIST_REMOVED"}

# ==========================================
# 黑名单管理 API (供后台页面调用)
# ==========================================
@app.get("/api/admin/blacklist")
async def get_blacklist(token_data: dict = Depends(verify_token)):
    cursor = blacklist_collection.find({}, {"_id": 0}).sort("added_at", -1)
    ips = await cursor.to_list(length=1000)
    return {"blacklist": ips}

@app.post("/api/admin/blacklist")
async def add_blacklist_ip(data: BlacklistIP, token_data: dict = Depends(verify_token)):
    valid_ip = require_valid_ip(data.ip)
    await blacklist_collection.update_one(
        {"ip": valid_ip},
        {"$set": {"ip": valid_ip, "added_at": datetime.utcnow().isoformat(), "source": "manual"}},
        upsert=True,
    )
    return {"message": "BLACKLIST_ADDED"}

@app.delete("/api/admin/blacklist/{ip}")
async def remove_blacklist_ip(ip: str, token_data: dict = Depends(verify_token)):
    valid_ip = require_valid_ip(ip)
    await blacklist_collection.delete_one({"ip": valid_ip})
    return {"message": "BLACKLIST_REMOVED"}

# ==========================================
# 在线聊天系统 API
# ==========================================

def validate_israeli_phone(phone: str) -> str:
    cleaned = normalize_phone_digits(phone)
    if not re.match(r"^05\d{8}$", cleaned):
        raise HTTPException(status_code=400, detail="INVALID_ISRAELI_PHONE")
    return cleaned

def serialize_message(doc: dict, session_id: str = "") -> dict:
    msg = {k: v for k, v in doc.items() if k not in {"_id", "created_at_dt"}}
    sid = session_id or msg.get("session_id") or ""
    if msg.get("image_id") and sid:
        msg["image_url"] = signed_image_url(msg["image_id"], sid)
    elif msg.get("image_id"):
        msg["image_url"] = f"/api/chat/images/{msg['image_id']}"
    return msg

async def send_telegram(text: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
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

async def send_new_session_welcome(session_id: str):
    """Auto-greet new visitors once per session (Hebrew welcome from admin side)."""
    ensure_mongo_context()
    existing = await chat_messages_collection.find_one(
        {"session_id": session_id, "client_message_id": WELCOME_MESSAGE_CLIENT_ID},
        {"_id": 1},
    )
    if existing:
        return
    await create_message_record(
        session_id=session_id,
        sender="admin",
        msg_type="text",
        content=NEW_SESSION_WELCOME_HE,
        client_message_id=WELCOME_MESSAGE_CLIENT_ID,
    )

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

def utc_now_iso() -> str:
    """UTC timestamp with Z suffix for correct JS Date parsing."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

async def ensure_session(session_id: str, visitor_name: str, visitor_phone: str, ip: str):
    now = utc_now_iso()
    result = await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "visitor_name": visitor_name,
                "visitor_phone": visitor_phone,
                "visitor_ip": ip,
                "last_seen_at": now,
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


async def touch_visitor_presence(session_id: str):
    """Update last_seen_at so admin can show online/offline."""
    if not session_id:
        return
    now = utc_now_iso()
    await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {"$set": {"last_seen_at": now}},
    )

async def save_image_original(file_bytes: bytes, filename: str, mime_type: str, session_id: str) -> str:
    ensure_mongo_context()
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
            "uploaded_at_dt": datetime.utcnow(),
        },
    )
    return image_id

async def delete_image_by_name(image_id: str):
    ensure_mongo_context()
    files = await chat_images_fs.find({"filename": image_id}).to_list(100)
    if files:
        for f in files:
            await chat_images_fs.delete(f._id)

async def get_image_by_id(image_id: str):
    """Returns (data, mime, filename, session_id) or (None, None, None, None)."""
    ensure_mongo_context()
    try:
        file_doc = await db["chat_images.files"].find_one(
            {"filename": image_id},
            sort=[("uploadDate", -1)],
        )
        if not file_doc:
            return None, None, None, None
        stream = await chat_images_fs.open_download_stream(file_doc["_id"])
        data = await stream.read()
        stream_meta = getattr(stream, "metadata", {}) or {}
        file_meta = file_doc.get("metadata") or {}
        mime = (
            stream_meta.get("mime_type")
            or file_meta.get("mime_type")
            or "image/jpeg"
        )
        filename = file_meta.get("filename") or stream_meta.get("filename") or "image"
        session_id = file_meta.get("session_id") or stream_meta.get("session_id") or ""
        return data, mime, filename, session_id
    except Exception:
        return None, None, None, None

async def create_message_record(
    session_id: str,
    sender: str,
    msg_type: str,
    content: str,
    client_message_id: str = "",
    image_id: str = "",
    filename: str = "",
    mime_type: str = "",
    content_original: str = "",
) -> dict:
    ensure_mongo_context()
    if client_message_id:
        existing = await chat_messages_collection.find_one(
            {"session_id": session_id, "client_message_id": client_message_id},
            {"_id": 0},
        )
        if existing:
            return serialize_message(existing, session_id)

    now = utc_now_iso()
    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    message_id = str(uuid.uuid4())
    preview = content[:100] if content else ("[Image]" if msg_type == "image" else "")
    if msg_type == "image" and filename:
        preview = f"[Image] {filename}"

    message = {
        "message_id": message_id,
        "session_id": session_id,
        "sender": sender,
        "type": msg_type,
        "content": content,
        "created_at": now,
        "created_at_dt": now_dt,
    }
    if client_message_id:
        message["client_message_id"] = client_message_id
    if content_original:
        message["content_original"] = content_original
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
                return serialize_message(existing, session_id)
        raise
    inc_field = "unread_admin" if sender == "visitor" else "unread_visitor"
    session_set = {"last_message_at": now, "last_message": preview[:100]}
    if sender == "visitor":
        session_set["last_seen_at"] = now
    await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {
            "$set": session_set,
            "$inc": {inc_field: 1},
            "$setOnInsert": {
                "session_id": session_id,
                "visitor_name": "Guest",
                "visitor_phone": "",
                "visitor_ip": "",
                "created_at": now,
            },
        },
        upsert=True,
    )
    return serialize_message(message, session_id)

async def create_image_message_record(
    session_id: str,
    sender: str,
    content: str,
    client_message_id: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
) -> dict:
    """
    保存图片到 GridFS，并创建一条类型为 image 的消息记录。
    统一处理 admin/visitor 两端的 client_message_id 兜底。
    """
    ensure_mongo_context()
    image_id = await save_image_original(file_bytes, filename, mime_type, session_id)
    message = await create_message_record(
        session_id,
        sender,
        "image",
        content,
        client_message_id,
        image_id,
        filename,
        mime_type,
    )
    if message.get("client_message_id") is None and client_message_id:
        message["client_message_id"] = client_message_id
    return message

async def create_text_message_record(
    session_id: str,
    sender: str,
    content: str,
    client_message_id: str,
    content_original: str = "",
) -> dict:
    """
    创建类型为 text 的消息记录，并做 client_message_id 兜底。
    """
    message = await create_message_record(
        session_id=session_id,
        sender=sender,
        msg_type="text",
        content=content,
        client_message_id=client_message_id,
        content_original=content_original,
    )
    if message.get("client_message_id") is None and client_message_id:
        message["client_message_id"] = client_message_id
    return message

@app.post("/api/chat/session")
async def create_or_get_chat_session(
    request: Request,
    data: ChatSessionCreate,
    background_tasks: BackgroundTasks,
):
    ensure_mongo_context()
    await enforce_chat_rate_limit(request)
    try:
        session_id = data.session_id.strip()
        if not session_id:
            raise HTTPException(status_code=400, detail="SESSION_ID_REQUIRED")

        visitor_name = data.visitor_name.strip()
        if not visitor_name or len(visitor_name) < 2:
            raise HTTPException(status_code=400, detail="NAME_REQUIRED")

        visitor_phone = validate_israeli_phone(data.visitor_phone)
        ip = get_client_ip(request)

        # If session already exists, require matching phone (prevent hijack)
        existing = await chat_sessions_collection.find_one({"session_id": session_id}, {"_id": 0})
        if existing:
            stored = normalize_phone_digits(existing.get("visitor_phone") or "")
            if stored and not hmac.compare_digest(stored, visitor_phone):
                raise HTTPException(status_code=403, detail="SESSION_ACCESS_DENIED")

        session, is_new = await ensure_session(session_id, visitor_name, visitor_phone, ip)
        if not session:
            raise HTTPException(status_code=500, detail="SESSION_CREATE_FAILED")

        if is_new:
            await send_new_session_welcome(session_id)
            background_tasks.add_task(notify_new_session, visitor_name, visitor_phone, session_id)

        return {
            "session_id": session["session_id"],
            "visitor_name": session.get("visitor_name", visitor_name),
            "visitor_phone": session.get("visitor_phone", visitor_phone),
            "unread_visitor": session.get("unread_visitor", 0),
        }
    except HTTPException:
        raise
    except Exception:
        if not os.environ.get("MONGO_URL"):
            raise HTTPException(status_code=503, detail="DB_NOT_CONFIGURED")
        raise HTTPException(status_code=503, detail="DB_CONNECTION_FAILED")

@app.post("/api/chat/ping")
async def ping_visitor_presence(
    request: Request,
    session_id: str = Query(...),
    visitor_phone: str = Query(""),
):
    """Lightweight presence heartbeat — does not fetch messages or clear unread."""
    ensure_mongo_context()
    ip = get_client_ip(request) or "unknown"
    limited = await check_rate_limit(
        f"chat_ping:{ip}",
        120,
        CHAT_RATE_LIMIT_WINDOW_SECONDS,
        increment=True,
    )
    if limited:
        raise HTTPException(status_code=429, detail="RATE_LIMITED")
    phone = visitor_phone_from_request(request, visitor_phone)
    await assert_visitor_session_access(session_id, phone, require_existing=True)
    await touch_visitor_presence(session_id)
    return {"ok": True, "ts": utc_now_iso()}


@app.get("/api/chat/sync")
async def sync_visitor_chat(
    request: Request,
    session_id: str = Query(...),
    visitor_phone: str = Query(""),
):
    """访客打开网站时同步未读消息（不重置未读数）"""
    ensure_mongo_context()
    phone = visitor_phone_from_request(request, visitor_phone)
    session = await assert_visitor_session_access(session_id, phone, require_existing=True)
    await touch_visitor_presence(session_id)
    cursor = chat_messages_collection.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1)
    messages = [serialize_message(m, session_id) for m in await cursor.to_list(length=2000)]
    return {
        "unread_visitor": session.get("unread_visitor", 0) if session else 0,
        "messages": messages,
    }

@app.get("/api/chat/messages")
async def get_visitor_messages(
    request: Request,
    session_id: str = Query(...),
    since: str = Query(None),
    visitor_phone: str = Query(""),
):
    ensure_mongo_context()
    await enforce_chat_rate_limit(request)
    phone = visitor_phone_from_request(request, visitor_phone)
    await assert_visitor_session_access(session_id, phone, require_existing=True)
    query = {"session_id": session_id}
    if since:
        query["created_at"] = {"$gt": since}

    cursor = chat_messages_collection.find(query, {"_id": 0}).sort("created_at", 1)
    messages = [serialize_message(m, session_id) for m in await cursor.to_list(length=2000)]

    await chat_sessions_collection.update_one(
        {"session_id": session_id},
        {"$set": {"unread_visitor": 0, "last_seen_at": utc_now_iso()}},
    )

    return {"messages": messages}

@app.post("/api/chat/messages")
async def send_visitor_message(
    request: Request,
    data: ChatMessageCreate,
    background_tasks: BackgroundTasks,
):
    ensure_mongo_context()
    await enforce_chat_rate_limit(request)
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="MESSAGE_EMPTY")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="MESSAGE_TOO_LONG")

    session_id = data.session_id.strip()
    visitor_name = data.visitor_name.strip()
    visitor_phone = validate_israeli_phone(data.visitor_phone) if data.visitor_phone else ""
    ip = get_client_ip(request)

    session = await chat_sessions_collection.find_one({"session_id": session_id})
    if not session:
        if not visitor_name or not visitor_phone:
            raise HTTPException(status_code=400, detail="REGISTRATION_REQUIRED")
        session, _ = await ensure_session(session_id, visitor_name, visitor_phone, ip)
    else:
        await assert_visitor_session_access(session_id, visitor_phone or visitor_phone_from_request(request), require_existing=True)
        visitor_name = visitor_name or session.get("visitor_name", "")
        visitor_phone = visitor_phone or session.get("visitor_phone", "")

    message = await create_text_message_record(
        session_id=session_id,
        sender="visitor",
        content=content,
        client_message_id=data.client_message_id,
    )
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
    ensure_mongo_context()
    await enforce_chat_rate_limit(request)
    file_bytes, mime_type = await read_and_validate_image(file)

    session_id = session_id.strip()
    ip = get_client_ip(request)
    session = await chat_sessions_collection.find_one({"session_id": session_id})
    vname = visitor_name.strip()
    vphone = validate_israeli_phone(visitor_phone) if visitor_phone else ""

    if not session:
        if not vname or not vphone:
            raise HTTPException(status_code=400, detail="REGISTRATION_REQUIRED")
        session, _ = await ensure_session(session_id, vname, vphone, ip)
    else:
        await assert_visitor_session_access(session_id, vphone or visitor_phone_from_request(request), require_existing=True)
        vname = vname or session.get("visitor_name", "")
        vphone = vphone or session.get("visitor_phone", "")

    filename = file.filename or "image.jpg"
    message = await create_image_message_record(
        session_id=session_id,
        sender="visitor",
        content=content.strip(),
        client_message_id=client_message_id,
        file_bytes=file_bytes,
        filename=filename,
        mime_type=mime_type,
    )
    background_tasks.add_task(
        notify_new_message, vname, vphone, f"[Image] {filename}", session_id, "image"
    )
    return {"message": message}

@app.get("/api/chat/images/{image_id}")
async def serve_chat_image(
    request: Request,
    image_id: str,
    session_id: str = Query(""),
    token: str = Query(""),
):
    ensure_mongo_context()
    data, mime, filename, img_session = await get_image_by_id(image_id)
    if not data:
        raise HTTPException(status_code=404, detail="IMAGE_NOT_FOUND")

    # Prefer short-lived signed URL; also allow admin JWT
    authorized = False
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.startswith("Bearer ") and JWT_SECRET:
        try:
            jwt.decode(auth_header[7:], JWT_SECRET, algorithms=["HS256"])
            authorized = True
        except Exception:
            authorized = False
    if not authorized:
        sid = (session_id or img_session or "").strip()
        if not sid or not token or not verify_image_token(image_id, sid, token):
            raise HTTPException(status_code=403, detail="IMAGE_ACCESS_DENIED")
        if img_session and sid != img_session:
            raise HTTPException(status_code=403, detail="IMAGE_ACCESS_DENIED")

    safe_name = "image.jpg"
    if filename and all(ord(c) < 128 for c in filename):
        safe_name = filename.replace('"', "")
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "private, max-age=300",
            "Accept-Ranges": "bytes",
        },
    )

@app.get("/api/admin/chat/sessions")
async def get_chat_sessions(token_data: dict = Depends(verify_token)):
    ensure_mongo_context()
    cursor = chat_sessions_collection.find({}, {"_id": 0}).sort("last_message_at", -1)
    sessions = await cursor.to_list(length=200)
    visitor_ips = [s.get("visitor_ip") for s in sessions if s.get("visitor_ip")]
    blacklist_set = set()
    if visitor_ips:
        cursor_bl = blacklist_collection.find(
            {"ip": {"$in": visitor_ips}},
            {"_id": 0},
        )
        bl_items = await cursor_bl.to_list(length=1000)
        blacklist_set = {b.get("ip") for b in bl_items if b.get("ip")}

    for s in sessions:
        s["blacklisted"] = bool(s.get("visitor_ip") in blacklist_set)
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
    messages = [serialize_message(m, session_id) for m in await cursor.to_list(length=2000)]

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
        raise HTTPException(status_code=400, detail="MESSAGE_EMPTY")

    session = await chat_sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="SESSION_NOT_FOUND")

    message = await create_text_message_record(
        session_id=session_id,
        sender="admin",
        content=content,
        client_message_id=data.client_message_id,
        content_original=(data.content_original or "").strip(),
    )
    return {"message": message}

@app.post("/api/admin/translate")
async def admin_translate(
    data: AdminTranslateRequest,
    token_data: dict = Depends(verify_token),
):
    """Translate text for admin ops (zh/he). Keys stay server-side."""
    from translate import translate_text

    text = (data.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="MESSAGE_EMPTY")
    target = (data.target or "zh").strip().lower()
    if target not in ("zh", "he"):
        raise HTTPException(status_code=400, detail="INVALID_TRANSLATE_TARGET")
    try:
        result = await asyncio.to_thread(
            translate_text, text, target, data.provider or None
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.warning("admin translate failed: %s", e)
        raise HTTPException(status_code=503, detail="TRANSLATE_FAILED") from e

@app.post("/api/admin/chat/sessions/{session_id}/upload")
async def upload_admin_image(
    session_id: str,
    file: UploadFile = File(...),
    content: str = Form(""),
    client_message_id: str = Form(""),
    token_data: dict = Depends(verify_token),
):
    ensure_mongo_context()
    file_bytes, mime_type = await read_and_validate_image(file)

    session = await chat_sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="SESSION_NOT_FOUND")

    filename = file.filename or "image.jpg"
    message = await create_image_message_record(
        session_id=session_id,
        sender="admin",
        content=content.strip(),
        client_message_id=client_message_id,
        file_bytes=file_bytes,
        filename=filename,
        mime_type=mime_type,
    )
    return {"message": message}

@app.delete("/api/admin/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, token_data: dict = Depends(verify_token)):
    deleted = await delete_session_completely(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="SESSION_NOT_FOUND")
    return {"message": "SESSION_DELETED"}