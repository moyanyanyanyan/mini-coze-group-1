from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.api import api_router
from app.common.logging import configure_logging
from app.config import get_settings
from app.runtime.errors import ModelError
from app.api.runtime import runtime_error, validation_error

configure_logging()
settings = get_settings()
app = FastAPI(title="MiniCoze Agent Service", version="0.1.0")
app.add_exception_handler(ModelError, runtime_error)
app.add_exception_handler(RequestValidationError, validation_error)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.backend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True,
    )
