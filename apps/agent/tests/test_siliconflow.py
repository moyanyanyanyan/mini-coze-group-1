import asyncio
import json

import httpx

from app.config import Settings
from app.runtime import call_model
from app.runtime.deepseek import stream_model
from app.runtime.schemas import ModelInput


def settings():
    return Settings(_env_file=None, DEEPSEEK_BASE_URL="https://api.siliconflow.cn/v1/",
                    DEEPSEEK_MODEL="deepseek-ai/DeepSeek-V4-Flash", DEEPSEEK_API_KEY="test-only-key")


def test_siliconflow_payload_and_nonstream():
    async def verify():
        def handler(request):
            body = json.loads(request.content)
            assert str(request.url) == "https://api.siliconflow.cn/v1/chat/completions"
            assert body["enable_thinking"] is False
            assert "thinking" not in body
            assert "stream_options" not in body
            return httpx.Response(200, json={"choices": [{"message": {"content": "你好"}, "finish_reason": "stop"}],
                                           "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await call_model(model=settings().deepseek_model, messages=[{"role": "user", "content": "Hi"}], settings=settings(), client=client)
        assert result.content == "你好" and result.usage.totalTokens == 7
    asyncio.run(verify())


def test_siliconflow_separate_usage_frame():
    async def verify():
        def handler(request):
            assert json.loads(request.content)["stream"] is True
            events = [
                {"choices": [{"delta": {"content": "你好"}, "finish_reason": None}]},
                {"choices": [{"delta": {}, "finish_reason": "stop"}]},
                {"choices": [], "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}},
            ]
            data = "".join("data: " + json.dumps(e) + "\n\n" for e in events) + "data: [DONE]\n\n"
            return httpx.Response(200, content=data, headers={"content-type": "text/event-stream"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            value = ModelInput(model=settings().deepseek_model, messages=[{"role": "user", "content": "Hi"}])
            values = [v async for v in stream_model(value, settings=settings(), client=client)]
        assert values[0] == "你好"
        assert values[-1].content == "你好" and values[-1].usage.totalTokens == 7
    asyncio.run(verify())
