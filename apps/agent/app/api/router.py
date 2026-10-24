from fastapi import APIRouter
from app.workflow.router import router as workflow_router

api_router = APIRouter()


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent"}


api_router.include_router(workflow_router)
