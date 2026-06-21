import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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

# 读取 Vercel 环境变量
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.exchange_db
config_collection = db.config

class ExchangeConfig(BaseModel):
    buyRate: float = 4.4
    sellRate: float = 3.3
    whatsappLink: str = "https://wa.me/972552452669"

@app.get("/api/config")
async def get_config():
    # 直接尝试从数据库获取数据
    config = await config_collection.find_one({}, {"_id": 0})
    if config:
        return config
    # 数据库为空时直接返回默认值
    return ExchangeConfig().model_dump() if hasattr(ExchangeConfig, 'model_dump') else ExchangeConfig().dict()

@app.post("/api/config")
async def update_config(config: ExchangeConfig):
    # 更新或插入新数据
    config_data = config.model_dump() if hasattr(config, 'model_dump') else config.dict()
    await config_collection.update_one({}, {"$set": config_data}, upsert=True)
    return {"message": "Config updated successfully"}
