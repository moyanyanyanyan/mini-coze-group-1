"""启动时预热本地模型；存活与可接收对话分别报告。"""
import asyncio
import logging
import math
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from starlette.concurrency import run_in_threadpool

from app.knowledge.embedding import embed_texts, EMBEDDING_DIMENSION
from app.runtime.errors import ModelError

logger = logging.getLogger(__name__)
WARMUP_TIMEOUT = 120

async def warmup(app: FastAPI) -> None:
    started = time.monotonic()
    try:
        async with asyncio.timeout(WARMUP_TIMEOUT):
            result = await run_in_threadpool(embed_texts, ["准备就绪"])
        vectors = result["vectors"]
        if len(vectors) != 1 or len(vectors[0]) != EMBEDDING_DIMENSION or not all(math.isfinite(v) for v in vectors[0]) or not any(vectors[0]):
            raise ValueError("Invalid warmup embedding")
    except TimeoutError:
        app.state.readiness = "failed"
        logger.error("Embedding warmup timed out after %.2fs", time.monotonic() - started)
    except Exception:
        app.state.readiness = "failed"
        logger.exception("Embedding warmup failed after %.2fs", time.monotonic() - started)
    else:
        app.state.readiness = "ready"
        logger.info("Embedding warmup ready after %.2fs", time.monotonic() - started)

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.readiness = "starting"
    task = asyncio.create_task(warmup(app))
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

def require_ready(request: Request) -> None:
    if getattr(request.app.state, "readiness", "starting") != "ready":
        raise ModelError("SERVICE_NOT_READY", "对话服务尚未就绪，请稍后重试", 503, True)
