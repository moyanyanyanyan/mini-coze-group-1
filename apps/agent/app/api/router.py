import logging
from hmac import compare_digest

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.knowledge.embedding import embed_texts
from app.knowledge.ocr import recognize_image
from app.knowledge.vision import describe_image
from app.api.runtime import router as runtime_router
from app.workflow.router import router as workflow_router

logger = logging.getLogger(__name__)

api_router = APIRouter()
api_router.include_router(runtime_router)

MAX_OCR_BYTES = 5 * 1024 * 1024


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent"}


@api_router.get("/ready")
def ready(request: Request):
    status = getattr(request.app.state, "readiness", "starting")
    return JSONResponse({"status": status, "code": None if status == "ready" else "SERVICE_NOT_READY"}, status_code=200 if status == "ready" else 503)


class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=32)


@api_router.post("/internal/knowledge/embeddings")
async def create_embeddings(
    request: EmbeddingRequest,
    authorization: str = Header(default=""),
) -> dict:
    token = get_settings().internal_service_token.get_secret_value()
    if not token:
        raise HTTPException(status_code=503, detail="Internal service token is not configured")
    if not compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Invalid service credential")
    if any(not text.strip() or len(text) > 600 for text in request.texts):
        raise HTTPException(status_code=400, detail="Each text must contain 1 to 600 characters")
    try:
        return await run_in_threadpool(embed_texts, request.texts)
    except Exception as exc:
        logger.exception("Embedding model failed")
        raise HTTPException(status_code=503, detail="Embedding model is unavailable") from exc

@api_router.post("/internal/knowledge/ocr")
async def create_ocr_text(
    request: Request,
    authorization: str = Header(default=""),
) -> dict:
    """OCR raw image bytes. Body is the image itself (no multipart) so the
    backend does not need a form parser dependency."""
    token = get_settings().internal_service_token.get_secret_value()
    if not token:
        raise HTTPException(status_code=503, detail="Internal service token is not configured")
    if not compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Invalid service credential")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Image body is empty")
    if len(data) > MAX_OCR_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds 5 MB")
    try:
        text = await run_in_threadpool(recognize_image, data)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="OCR model is unavailable") from exc
    return {"text": text, "chars": len(text)}


@api_router.post("/internal/knowledge/vision")
async def create_vision_description(
    request: Request,
    authorization: str = Header(default=""),
) -> dict:
    """Describe raw image bytes. Same body format as OCR to reuse the byte path."""
    settings = get_settings()
    token = settings.internal_service_token.get_secret_value()
    if not token:
        raise HTTPException(status_code=503, detail="Internal service token is not configured")
    if not compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Invalid service credential")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Image body is empty")
    if len(data) > MAX_OCR_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds 5 MB")
    if not settings.vision_available:
        raise HTTPException(status_code=503, detail="Vision model is not configured")
    try:
        description = await describe_image(
            data, request.headers.get("content-type", ""), settings
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Vision model is unavailable: {exc}") from exc
    return {"description": description, "chars": len(description)}


api_router.include_router(workflow_router)
