import os
import certifi
import asyncio
import secrets
import time
import httpx
from fastapi import FastAPI, Request, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import jwt
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

# ==========================================
# 优化 3: 数据库性能优化 (启动时创建索引)
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行：为白名单 IP 创建唯一索引，查询速度提升百倍，同时防止并发重复插入
    await whitelist_collection.create_index("ip", unique=True)
    yield
    # 关闭时的清理操作可以写在这里

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

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)

DEFAULT_ADMIN_PATH = "/xiaoyan"
DEFAULT_ADMIN_PASSWORD = "Qw123456.."

client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
db = client.exchange_db
config_collection = db.config
whitelist_collection = db.whitelist

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

# ==========================================
# 访客追踪与防轰炸变量
# ==========================================
IP_COOLDOWN = {}
COOLDOWN_SECONDS = 3600  # 同 IP 1 小时内不会重复发消息

async def get_visitor_count():
    counter_doc = await db.counters.find_one_and_update(
        {"_id": "visitor_id"},
        {"$inc": {"sequence_value": 1}},
        upsert=True,
        return_document=True
    )
    return counter_doc["sequence_value"]

def parse_user_agent(ua_string: str):
    os_info = "未知系统"
    browser_info = "未知浏览器"
    if not ua_string:
        return os_info, browser_info
        
    ua_lower = ua_string.lower()
    
    if "windows" in ua_lower: os_info = "Windows"
    elif "mac os x" in ua_lower: os_info = "macOS"
    elif "android" in ua_lower: os_info = "Android"
    elif "iphone" in ua_lower or "ipad" in ua_lower: os_info = "iOS"
    elif "linux" in ua_lower: os_info = "Linux"
    
    if "chrome" in ua_lower and "edg" not in ua_lower: browser_info = "Chrome"
    elif "safari" in ua_lower and "chrome" not in ua_lower: browser_info = "Safari"
    elif "firefox" in ua_lower: browser_info = "Firefox"
    elif "edg" in ua_lower: browser_info = "Edge"
    else: browser_info = ua_string[:30] 
    
    return os_info, browser_info

# 异步发送 TG 消息的后台任务
async def send_telegram_notification(ip: str, user_agent: str):
    current_time = time.time()
    
    if ip in IP_COOLDOWN and current_time - IP_COOLDOWN[ip] < COOLDOWN_SECONDS:
        return
        
    IP_COOLDOWN[ip] = current_time
    
    visitor_id = await get_visitor_count()
    os_info, browser_info = parse_user_agent(user_agent)
    time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    text = (f"🚨 网站新访客提醒\n\n"
            f"编号：{visitor_id}\n"
            f"时间：{time_str}\n"
            f"IP：{ip}\n"
            f"操作系统：{os_info}\n"
            f"浏览器：{browser_info}")
            
    BOT_TOKEN = '8985091533:AAE72fpF3qP7tZ9Az9JVEQZ2YNuUwE6rIUk'
    CHAT_ID = '8500753537'
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json={"chat_id": CHAT_ID, "text": text})
        except Exception:
            pass

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

    if ip in ["127.0.0.1", "::1", "localhost"]:
        return await call_next(request)
        
    # 第一步：查数据库白名单 (此时已有唯一索引，查询极快)
    whitelist_entry = await whitelist_collection.find_one({"ip": ip})
    if whitelist_entry:
        return await call_next(request)

    # 将写入白名单的操作封装，使用 update_one + upsert 防止高并发下唯一索引报错
    async def auto_whitelist(user_ip: str):
        await whitelist_collection.update_one(
            {"ip": user_ip},
            {"$setOnInsert": {"ip": user_ip, "added_at": datetime.utcnow().isoformat(), "auto_added": True}},
            upsert=True
        )
        
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
        async with httpx.AsyncClient() as client:
            res1 = await client.get(f"http://ip-api.com/json/{ip}", timeout=2.0)
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
        async with httpx.AsyncClient() as client:
            res2 = await client.get(f"https://api.country.is/{ip}", timeout=2.0)
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
    config = await config_collection.find_one({}, {"_id": 0}) or {}
    real_path = config.get("adminPath", DEFAULT_ADMIN_PATH)
    normalized_req = "/" + data.path.strip("/")
    normalized_real = "/" + real_path.strip("/")
    return {"is_admin": normalized_req == normalized_real}

@app.post("/api/admin/login")
async def admin_login(data: LoginRequest):
    await asyncio.sleep(1.5) 
    config = await config_collection.find_one({}, {"_id": 0}) or {}
    real_password = config.get("adminPassword", DEFAULT_ADMIN_PASSWORD)
    
    if data.password != real_password:
        raise HTTPException(status_code=401, detail="访问密钥错误 (Invalid Access Key)")
    
    token = jwt.encode({"sub": "admin", "exp": datetime.utcnow() + timedelta(hours=24)}, JWT_SECRET, algorithm="HS256")
    return {"token": token}

@app.get("/api/config")
async def get_public_config(request: Request, background_tasks: BackgroundTasks):
    config = await config_collection.find_one({}, {"_id": 0}) or {}
    
    ip = request.headers.get("x-forwarded-for", request.client.host).split(",")[0].strip()
    user_agent = request.headers.get("user-agent", "")
    
    # 获取页面配置时，异步执行 Telegram 通知，不卡顿
    background_tasks.add_task(send_telegram_notification, ip, user_agent)
    
    return {
        "buyRate": config.get("buyRate", 4.4),
        "sellRate": config.get("sellRate", 3.3),
        "whatsappLink": config.get("whatsappLink", "https://wa.me/972552452669")
    }

@app.get("/api/admin/config")
async def get_admin_config(token_data: dict = Depends(verify_token)):
    config = await config_collection.find_one({}, {"_id": 0}) or {}
    return AdminConfig(
        buyRate=config.get("buyRate", 4.4),
        sellRate=config.get("sellRate", 3.3),
        whatsappLink=config.get("whatsappLink", "https://wa.me/972552452669"),
        adminPath=config.get("adminPath", DEFAULT_ADMIN_PATH),
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
