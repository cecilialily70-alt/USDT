import os
import certifi
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pymongo import MongoClient
from pydantic import BaseModel

app = FastAPI()

# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 新增：IP 拦截全局中间件
# ==========================================
@app.middleware("http")
async def ip_block_middleware(request: Request, call_next):
    # 尝试获取 Vercel 或 Cloudflare 注入的访客国家/地区代码
    # Vercel 环境通常是 "x-vercel-ip-country"
    country = request.headers.get("x-vercel-ip-country") or request.headers.get("cf-ipcountry")
    
    # 如果获取到了国家代码，并且不在香港 ("HK") 和以色列 ("IL") 之中
    if country and country not in ["HK", "IL"]:
        # 静默拦截：直接返回 302 重定向到谷歌搜索主页
        return RedirectResponse(url="https://www.google.com", status_code=302)
        
    # 如果是本地开发环境 (没有 country 标识) 或在白名单内，则正常处理请求
    response = await call_next(request)
    return response

# ==========================================
# 数据库与业务逻辑
# ==========================================

# 读取 Vercel 环境变量
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")

# 使用最稳定的同步连接 (MongoClient)
client = MongoClient(MONGO_URL, tlsCAFile=certifi.where())
db = client.exchange_db
config_collection = db.config

class ExchangeConfig(BaseModel):
    buyRate: float = 4.4
    sellRate: float = 3.3
    whatsappLink: str = "https://wa.me/972552452669"

@app.get("/api/config")
def get_config():
    # 同步读取
    config = config_collection.find_one({}, {"_id": 0})
    if config:
        return config
    return ExchangeConfig().model_dump() if hasattr(ExchangeConfig, 'model_dump') else ExchangeConfig().dict()

@app.post("/api/config")
def update_config(config: ExchangeConfig):
    # 同步写入
    config_data = config.model_dump() if hasattr(config, 'model_dump') else config.dict()
    config_collection.update_one({}, {"$set": config_data}, upsert=True)
    return {"message": "Config updated successfully"}
