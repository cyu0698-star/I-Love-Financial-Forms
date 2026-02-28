from fastapi import APIRouter, Request

from app.schemas.document import ProcessRequest, ProcessResponse
from app.services.gemini_service import (
    process_document_with_gemini,
    test_gemini_connection,
)

router = APIRouter()


@router.post("/api/process", response_model=ProcessResponse)
async def process_document(request: ProcessRequest, fastapi_request: Request):
    client = fastapi_request.app.state.client
    result = process_document_with_gemini(
        client=client,
        file_base64=request.fileBase64,
        mime_type=request.mimeType,
        template_type=request.templateType,
    )
    return ProcessResponse(**result)


@router.post("/api/test")
async def test_gemini(fastapi_request: Request):
    return test_gemini_connection(fastapi_request.app.state.client)
