from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai

from app.api.router import api_router
from app.core.config import configure_proxy, get_gemini_api_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_proxy()
    api_key = get_gemini_api_key()

    if not api_key:
        print("[警告] GEMINI_API_KEY 未配置，请在 .env 文件中设置")
        app.state.client = None
    else:
        app.state.client = genai.Client(api_key=api_key)
        print("[Gemini] API 客户端已初始化")

    yield


app = FastAPI(
    title="财务文件识别 API",
    description="使用 Google Gemini 处理财务文件",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
