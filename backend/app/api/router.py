from fastapi import APIRouter

from app.api.routes.document import router as document_router
from app.api.routes.system import router as system_router

api_router = APIRouter()
api_router.include_router(system_router)
api_router.include_router(document_router)
