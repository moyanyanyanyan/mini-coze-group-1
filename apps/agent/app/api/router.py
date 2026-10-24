from fastapi import APIRouter
from app.api.runtime import router as runtime_router
from app.workflow.router import router as workflow_router

api_router = APIRouter()
api_router.include_router(runtime_router)


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent"}


api_router.include_router(workflow_router)
