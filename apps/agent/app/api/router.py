from hmac import compare_digest

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.knowledge.embedding import embed_texts
from app.api.runtime import router as runtime_router

api_router = APIRouter()
api_router.include_router(runtime_router)


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent"}


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
        raise HTTPException(status_code=503, detail="Embedding model is unavailable") from exc
