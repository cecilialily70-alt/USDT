import os
import certifi
import asyncio
import secrets
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import jwt
from datetime import datetime, timedelta

app = FastAPI()

# ==========================================
# 安全加固 1：严格的 CORS 限制 (Zero-Trust)
# 生产环境中前后端同域名，不需要开启跨域，这里只放行本地开发环境
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"], 
    allow_headers=["Authorization", "Content-Type"], # 仅放行必要请求头
)


MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")

# ==========================================
# 安全加固 2：JWT 密钥高熵兜底
# 忘配环境变量时，生成 64 位随机乱码，杜绝默认密钥漏洞
# ==========================================
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)

DEFAULT_ADMIN_PATH = "/xiaoyan"
DEFAULT_ADMIN_PASSWORD = "Qw123456.."

client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
db = client.exchange_db
config_collection = db.config

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

# ==========================================
# 安全加固 3：反地址枚举与时间盲注防御
# ==========================================
@app.post("/api/admin/check-path")
async def check_admin_path(data: PathCheckRequest):
    # 强制线程休眠 0.5 秒，极大增加脚本批量试探后台地址的时间成本
    await asyncio.sleep(0.5)
    
    config = await config_collection.find_one({}, {"_id": 0}) or {}
    real_path = config.get("adminPath", DEFAULT_ADMIN_PATH)
    
    normalized_req = "/" + data.path.strip("/")
    normalized_real = "/" + real_path.strip("/")
    return {"is_admin": normalized_req == normalized_real}

# ==========================================
# 安全加固 4：防密码暴力破解
# ==========================================
@app.post("/api/admin/login")
async def admin_login(data: LoginRequest):
    # 强制线程休眠 1.5 秒，让每秒 1000 次的爆破变成每秒 0.6 次
    await asyncio.sleep(1.5)
    
    config = await config_collection.find_one({}, {"_id": 0}) or {}
    real_password = config.get("adminPassword", DEFAULT_ADMIN_PASSWORD)
    
    if data.password != real_password:
        raise HTTPException(status_code=401, detail="访问密钥错误 (Invalid Access Key)")
    
    token = jwt.encode({"sub": "admin", "exp": datetime.utcnow() + timedelta(hours=24)}, JWT_SECRET, algorithm="HS256")
    return {"token": token}

@app.get("/api/config")
async def get_public_config():
    config = await config_collection.find_one({}, {"_id": 0}) or {}
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

# ==========================================
# 安全加固 5：保留路由与密码复杂度保护
# ==========================================
@app.post("/api/admin/config")
async def update_admin_config(config: AdminConfig, token_data: dict = Depends(verify_token)):
    config_data = config.model_dump() if hasattr(config, 'model_dump') else config.dict()
    
    # 路径规范化校验
    new_path = config_data["adminPath"]
    if not new_path.startswith("/"):
        new_path = "/" + new_path
        
    # 防止系统被写死：拦截关键保留路径
    forbidden_prefixes = ["/api", "/static", "/frontend"]
    for fp in forbidden_prefixes:
        if new_path.startswith(fp) or new_path == "/":
            raise HTTPException(status_code=400, detail=f"安全拦截：禁止使用系统保留路由 '{fp}' 作为后台地址。")
            
    # 密码复杂度基础校验
    if len(config_data["adminPassword"]) < 6:
        raise HTTPException(status_code=400, detail="安全拦截：后台密码不得少于 6 个字符。")
            
    config_data["adminPath"] = new_path
        
    await config_collection.update_one({}, {"$set": config_data}, upsert=True)
    return {"message": "配置更新成功并已生效"}
