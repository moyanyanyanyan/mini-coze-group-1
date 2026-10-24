import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.runtime.errors import ModelError
from app.runtime.schemas import ChatMessage, ModelInput, ModelResult, Usage


def validate_model(value: ModelInput, settings: Settings) -> None:
    allowed = {settings.deepseek_model} | {
        name.strip() for name in settings.deepseek_allowed_models.split(",") if name.strip()
    }
    if value.model not in allowed:
        raise ModelError("INVALID_REQUEST", "模型不在服务端允许列表内", 400)
    if not settings.deepseek_api_key.get_secret_value().strip():
        raise ModelError("MODEL_NOT_CONFIGURED", "模型服务未配置", 503)


def check_budget(messages: list[ChatMessage], max_tokens: int, settings: Settings) -> None:
    # 以 UTF-8 字节数保守估计输入上界；不是供应商的精确 token 计数。
    upper_bound = sum(len(m.content.encode("utf-8")) + 16 for m in messages) + 32
    if upper_bound + max_tokens > settings.context_token_limit:
        raise ModelError("INVALID_REQUEST", "上下文超出本服务预算，请缩短输入", 400)


@asynccontextmanager
async def model_client(client: httpx.AsyncClient | None, *, trust_env: bool = True):
    if client is not None:
        yield client
    else:
        async with httpx.AsyncClient(follow_redirects=False, trust_env=trust_env) as owned:
            yield owned


def check_status(response: httpx.Response) -> None:
    if response.status_code == 402:
        raise ModelError("MODEL_QUOTA_EXCEEDED", "模型账号余额不足，请联系维护者", 503)
    if response.status_code == 429:
        raise ModelError("MODEL_RATE_LIMITED", "模型服务限流，请稍后重试", 503, True)
    if response.status_code in (401, 403):
        raise ModelError("MODEL_AUTH_FAILED", "模型服务凭证无效，请联系维护者", 502)
    if response.status_code >= 400:
        raise ModelError("MODEL_UNAVAILABLE", "模型服务请求失败", 502, response.status_code >= 500)


def usage_from(data: dict) -> Usage | None:
    value = data.get("usage")
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("invalid usage")
    return Usage(promptTokens=value["prompt_tokens"], completionTokens=value["completion_tokens"], totalTokens=value["total_tokens"])


def check_finish(reason: str) -> None:
    if reason == "content_filter":
        raise ModelError("MODEL_OUTPUT_REJECTED", "模型拒绝了本次输出", 502)
    if reason not in ("stop", "length"):
        raise ModelError("MODEL_UNAVAILABLE", "模型未正常完成；本周不支持自动工具调用", 502)


def payload(value: ModelInput, stream: bool, settings: Settings) -> dict:
    body = value.model_dump()
    body["messages"] = [m.model_dump() for m in value.messages]
    # 本周固定为非思考文本模式，temperature 生效且不暴露 reasoning_content。
    body["stream"] = stream
    if settings.effective_model_provider == "siliconflow":
        body["enable_thinking"] = False
    else:
        body["thinking"] = {"type": "disabled"}
    if stream and settings.effective_model_provider == "deepseek":
        body["stream_options"] = {"include_usage": True}
    return body


async def stream_model(value: ModelInput, *, settings: Settings, client: httpx.AsyncClient | None = None) -> AsyncIterator[str | ModelResult]:
    validate_model(value, settings)
    check_budget(value.messages, value.max_tokens, settings)
    content: list[str] = []
    reason = None
    usage = None
    done = False
    try:
        async with asyncio.timeout(settings.model_timeout):
            async with model_client(client, trust_env=settings.model_trust_env) as connection:
                async with connection.stream(
                    "POST", settings.deepseek_base_url.rstrip("/") + "/chat/completions",
                    headers={"Authorization": "Bearer " + settings.deepseek_api_key.get_secret_value()},
                    json=payload(value, True, settings), timeout=settings.model_timeout,
                ) as response:
                    check_status(response)
                    if "text/event-stream" not in response.headers.get("content-type", ""):
                        raise ModelError("MODEL_PROTOCOL_ERROR", "模型未返回事件流", 502)
                    lines: list[str] = []
                    async for line in response.aiter_lines():
                        if line.startswith(":"):
                            continue
                        if line:
                            if line.startswith("data:"):
                                lines.append(line[5:].lstrip(" "))
                            if sum(map(len, lines)) > 1_000_000:
                                raise ModelError("MODEL_PROTOCOL_ERROR", "模型事件过大", 502)
                            continue
                        if not lines:
                            continue
                        event = "\n".join(lines)
                        lines = []
                        if event == "[DONE]":
                            done = True
                            break
                        chunk = json.loads(event)
                        if not isinstance(chunk, dict):
                            raise ValueError("invalid event")
                        if chunk.get("error"):
                            raise ModelError("MODEL_UNAVAILABLE", "模型返回错误事件", 502)
                        if chunk.get("usage") is not None:
                            usage = usage_from(chunk)
                        choices = chunk["choices"]
                        if not isinstance(choices, list):
                            raise ValueError("invalid choices")
                        if not choices:
                            continue
                        choice = choices[0]
                        if not isinstance(choice, dict):
                            raise ValueError("invalid choice")
                        delta = choice["delta"]
                        if not isinstance(delta, dict):
                            raise ValueError("invalid delta")
                        # 允许结束后的独立统计帧，但不接受新的文字或工具调用。
                        if reason is not None:
                            if delta.get("content") or delta.get("tool_calls") or choice.get("finish_reason") not in (None, reason):
                                raise ModelError("MODEL_PROTOCOL_ERROR", "模型结束后仍返回内容", 502)
                            continue
                        if delta.get("tool_calls"):
                            raise ModelError("TOOL_NOT_SUPPORTED", "自动工具调用将在后续周接入", 502)
                        text = delta.get("content")
                        if text is not None and not isinstance(text, str):
                            raise ValueError("invalid content")
                        if text:
                            content.append(text)
                            yield text
                        if choice.get("finish_reason") is not None:
                            reason = choice["finish_reason"]
                            check_finish(reason)
        if not done or reason is None:
            raise ModelError("MODEL_STREAM_INTERRUPTED", "模型连接中断，未收到完整结束标记", 502, True)
        yield ModelResult(content="".join(content), finishReason=reason, usage=usage)
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise ModelError("MODEL_TIMEOUT", "模型生成超时", 504, True) from exc
    except httpx.HTTPError as exc:
        raise ModelError("MODEL_UNAVAILABLE", "模型连接失败", 502, True) from exc
    except (ValueError, KeyError, IndexError, TypeError, ValidationError) as exc:
        raise ModelError("MODEL_PROTOCOL_ERROR", "模型返回格式不合法", 502) from exc


async def call_model(*, model: str, messages: list[dict[str, str]], temperature: float = 0.7,
                     max_tokens: int = 1024, settings: Settings | None = None,
                     client: httpx.AsyncClient | None = None) -> ModelResult:
    """工作流公共入口：成功返回结果；预期依赖失败抛 ModelError，取消继续传播。"""
    value = ModelInput(model=model, messages=messages, temperature=temperature, max_tokens=max_tokens)
    active = settings or get_settings()
    validate_model(value, active)
    check_budget(value.messages, value.max_tokens, active)
    try:
        async with asyncio.timeout(active.model_timeout):
            async with model_client(client, trust_env=active.model_trust_env) as connection:
                response = await connection.post(
                    active.deepseek_base_url.rstrip("/") + "/chat/completions",
                    headers={"Authorization": "Bearer " + active.deepseek_api_key.get_secret_value()},
                    json=payload(value, False, active), timeout=active.model_timeout,
                )
                check_status(response)
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError("invalid completion")
                choice = data["choices"][0]
                if not isinstance(choice, dict) or not isinstance(choice.get("message"), dict):
                    raise ValueError("invalid completion message")
                check_finish(choice["finish_reason"])
                if choice["message"].get("tool_calls"):
                    raise ModelError("TOOL_NOT_SUPPORTED", "工作流单次调用不执行工具", 502)
                return ModelResult(content=choice["message"]["content"], finishReason=choice["finish_reason"], usage=usage_from(data))
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise ModelError("MODEL_TIMEOUT", "模型生成超时", 504, True) from exc
    except httpx.HTTPError as exc:
        raise ModelError("MODEL_UNAVAILABLE", "模型连接失败", 502, True) from exc
    except (ValueError, KeyError, IndexError, TypeError, ValidationError) as exc:
        raise ModelError("MODEL_PROTOCOL_ERROR", "模型返回格式不合法", 502) from exc
