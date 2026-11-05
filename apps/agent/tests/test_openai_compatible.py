import asyncio
import json

import httpx

from app.config import Settings
from app.runtime import call_model
from app.runtime.deepseek import stream_model
from app.runtime.schemas import ModelInput


def settings():
    return Settings(_env_file=None, DEEPSEEK_BASE_URL="https://api.x5m5x.com/v1",
                    DEEPSEEK_MODEL="deepseek-v4-flash-0731", DEEPSEEK_API_KEY="test-only-key")


def test_generic_gateway_nonstream_uses_standard_fields():
    async def verify():
        def handler(request):
            body = json.loads(request.content)
            assert str(request.url) == "https://api.x5m5x.com/v1/chat/completions"
            assert body["model"] == "deepseek-v4-flash-0731"
            assert "thinking" not in body and "enable_thinking" not in body
            return httpx.Response(200, json={"choices": [{"message": {"content": "测试成功"}, "finish_reason": "stop"}]})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await call_model(model=settings().deepseek_model,
                                      messages=[{"role": "user", "content": "Hi"}], settings=settings(), client=client)
        assert result.content == "测试成功"

    asyncio.run(verify())


def test_generic_gateway_stream_uses_standard_fields():
    async def verify():
        def handler(request):
            body = json.loads(request.content)
            assert body["stream"] is True
            assert "thinking" not in body and "enable_thinking" not in body
            assert "stream_options" not in body
            events = [
                {"choices": [{"delta": {"content": "测试成功"}, "finish_reason": None}]},
                {"choices": [{"delta": {}, "finish_reason": "stop"}]},
            ]
            data = "".join("data: " + json.dumps(event) + "\n\n" for event in events) + "data: [DONE]\n\n"
            return httpx.Response(200, content=data, headers={"content-type": "text/event-stream"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            value = ModelInput(model=settings().deepseek_model, messages=[{"role": "user", "content": "Hi"}])
            values = [item async for item in stream_model(value, settings=settings(), client=client)]
        assert values[0] == "测试成功" and values[-1].content == "测试成功"

    asyncio.run(verify())
