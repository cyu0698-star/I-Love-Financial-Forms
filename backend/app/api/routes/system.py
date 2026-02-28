from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "财务文件识别 API", "status": "running"}


@router.get("/health")
async def health(request: Request):
    return {"status": "ok", "gemini_configured": request.app.state.client is not None}
