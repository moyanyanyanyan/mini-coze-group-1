import asyncio
import hmac
import json
from contextlib import aclosing
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import get_settings
from app.runtime.errors import ModelError
from app.runtime.schemas import RuntimeRequest
from app.runtime.service import RuntimeService
from app.runtime.providers import HttpKnowledgeProvider
from app.runtime.http_providers import HttpPluginProvider


def get_runtime() -> RuntimeService:
    settings = get_settings()
    return RuntimeService(settings, knowledge=HttpKnowledgeProvider(settings), plugins=HttpPluginProvider(settings))


def internal_auth(request: Request) -> None:
    token = get_settings().internal_service_token.get_secret_value()
    if not token:
        raise ModelError("INTERNAL_NOT_CONFIGURED", "内部服务凭证未配置", 503)
    authorization = request.headers.get("authorization", "")
    if not hmac.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
        raise ModelError("INTERNAL_UNAUTHORIZED", "内部服务凭证无效", 401)


router = APIRouter(prefix="/internal/runtime", dependencies=[Depends(internal_auth)])


@router.post("/run")
async def run(body: RuntimeRequest, runtime: RuntimeService = Depends(get_runtime)):
    runtime.preflight(body)
    return await runtime.run(body)


async def sse_events(runtime: RuntimeService, body: RuntimeRequest):
    queue: asyncio.Queue[dict | None] = asyncio.Queue(maxsize=1)

    async def produce():
        # 同一次运行保持在一个任务内，确保模型/整轮超时取消正确的任务。
        async with aclosing(runtime.events(body)) as events:
            async for item in events:
                await queue.put(item)
        await queue.put(None)

    pending = asyncio.create_task(produce())
    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                if pending.done():
                    # 生产者异常结束时关闭流；调用方将缺失终态识别为中断。
                    pending.result()
                    return
                yield ": heartbeat\n\n"
                continue
            if item is None:
                return
            yield (f"id: {item['runId']}:{item['seq']}\nevent: {item['type']}\n"
                   f"data: {json.dumps(item, ensure_ascii=False)}\n\n")
    finally:
        # 客户端断开时取消正在等待的模型读取，关闭上游连接。
        if not pending.done():
            pending.cancel()
        try:
            await pending
        except asyncio.CancelledError:
            pass


@router.post("/stream")
async def stream(body: RuntimeRequest, runtime: RuntimeService = Depends(get_runtime)):
    runtime.preflight(body)
    return StreamingResponse(sse_events(runtime, body), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def runtime_error(request: Request, exc: ModelError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={
        "statusCode": exc.status, "message": exc.message, "path": request.url.path,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }, headers={"X-Runtime-Error-Code": exc.code})


async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # 不回显 Pydantic input，里面可能包含用户消息或配置。
    return await runtime_error(request, ModelError("INVALID_REQUEST", "请求字段、历史顺序或参数不合法", 400))
