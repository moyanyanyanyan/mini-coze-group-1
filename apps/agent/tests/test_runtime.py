import asyncio
import json
from contextlib import aclosing

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.main import app
from app.runtime import ModelError, call_model
from app.runtime import routes
from app.runtime.deepseek import stream_model
from app.runtime.schemas import KnowledgeResult, ModelInput, RuntimeRequest
from app.runtime.service import RuntimeService


@pytest.fixture
def settings():
    return Settings(_env_file=None, DEEPSEEK_API_KEY="test-only-key", INTERNAL_SERVICE_TOKEN="test-internal")


@pytest.fixture
def body():
    return {"runId": "run_test", "actor": {"id": "user_test"}, "conversationId": "conv_test",
            "userMessageId": "msg_current_user", "assistantMessageId": "msg_current_assistant",
            "agentConfig": {"id": "agent_test", "revision": 0, "name": "测试助手", "systemPrompt": "只答问题",
                            "model": "deepseek-flash", "temperature": 0.7, "maxTokens": 128,
                            "knowledgeBaseIds": [], "pluginIds": []},
            "history": [], "message": "你好"}


def chunk(text=None, finish=None, usage=None):
    value = {"choices": [{"delta": {"content": text}, "finish_reason": finish}]}
    if usage is not None:
        value["usage"] = usage
    return "data: " + json.dumps(value, ensure_ascii=False) + "\r\n\r\n"


def stream_bytes(*, done=True, finish="stop", usage=True):
    data = ": ping\r\n" + chunk("你") + chunk("好", finish,
        {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12} if usage else None)
    return (data + ("data: [DONE]\r\n\r\n" if done else "")).encode()


class Segmented(httpx.AsyncByteStream):
    def __init__(self, data):
        self.data = data
        self.closed = False

    async def __aiter__(self):
        # 逐字节分块，验证中文 UTF-8、CRLF 与 SSE 边界均不依赖网络分块。
        for byte in self.data:
            yield bytes([byte])

    async def aclose(self):
        self.closed = True


def transport(data=None, status=200, handler=None):
    return httpx.MockTransport(handler or (lambda request: httpx.Response(
        status, stream=Segmented(data if data is not None else stream_bytes()),
        headers={"content-type": "text/event-stream"})))


async def collect(service, body):
    return [event async for event in service.events(RuntimeRequest.model_validate(body))]


def test_sse_utf8_sequence_and_result(settings, body):
    async def verify():
        async with httpx.AsyncClient(transport=transport()) as client:
            events = await collect(RuntimeService(settings, client=client), body)
        assert [e["type"] for e in events] == ["run.started", "message.delta", "message.delta", "run.completed"]
        assert [e["seq"] for e in events] == [1, 2, 3, 4]
        assert all(e["runId"] == body["runId"] for e in events)
        result = events[-1]["data"]
        assert result["content"] == "".join(e["data"]["content"] for e in events if e["type"] == "message.delta") == "你好"
        assert result["usage"]["totalTokens"] == 12
        assert result["assistantMessageId"] == body["assistantMessageId"]
        assert result["status"] == "completed"
    asyncio.run(verify())


@pytest.mark.parametrize("raw,code", [
    (stream_bytes(done=False), "MODEL_STREAM_INTERRUPTED"),
    (b"data: [DONE]\n\n", "MODEL_STREAM_INTERRUPTED"),
    (b"data: invalid\n\n", "MODEL_PROTOCOL_ERROR"),
    (b'data: "invalid-object"\n\n', "MODEL_PROTOCOL_ERROR"),
    (stream_bytes(finish="content_filter"), "MODEL_OUTPUT_REJECTED"),
    (stream_bytes(finish="tool_calls"), "MODEL_UNAVAILABLE"),
])
def test_bad_stream_never_completes(settings, body, raw, code):
    async def verify():
        async with httpx.AsyncClient(transport=transport(raw)) as client:
            events = await collect(RuntimeService(settings, client=client), body)
        assert events[-1]["type"] == "run.failed"
        assert events[-1]["data"]["code"] == code
        assert not any(e["type"] == "run.completed" for e in events)
    asyncio.run(verify())


@pytest.mark.parametrize("status,code", [(401, "MODEL_AUTH_FAILED"), (402, "MODEL_QUOTA_EXCEEDED"), (429, "MODEL_RATE_LIMITED"), (500, "MODEL_UNAVAILABLE")])
def test_upstream_status(settings, body, status, code):
    async def verify():
        async with httpx.AsyncClient(transport=transport(status=status)) as client:
            events = await collect(RuntimeService(settings, client=client), body)
        assert events[-1]["data"]["code"] == code
        assert "test-only-key" not in json.dumps(events)
    asyncio.run(verify())


def test_workflow_public_function(settings):
    async def verify():
        def response(request):
            value = json.loads(request.content)
            assert value["stream"] is False
            assert value["max_tokens"] == 64
            assert value["thinking"] == {"type": "disabled"}
            return httpx.Response(200, json={"choices": [{"message": {"content": "完成"}, "finish_reason": "length"}]})
        async with httpx.AsyncClient(transport=transport(handler=response)) as client:
            result = await call_model(model="deepseek-flash", messages=[{"role": "user", "content": "问题"}],
                                      max_tokens=64, settings=settings, client=client)
        assert result.model_dump() == {"content": "完成", "finishReason": "length", "usage": None}
    asyncio.run(verify())


def test_workflow_errors_are_exceptions(settings):
    async def verify():
        async with httpx.AsyncClient(transport=transport(status=429)) as client:
            with pytest.raises(ModelError, match="限流") as caught:
                await call_model(model="deepseek-flash", messages=[{"role": "user", "content": "问题"}], settings=settings, client=client)
            assert caught.value.code == "MODEL_RATE_LIMITED"
        with pytest.raises(ValidationError):
            await call_model(model="deepseek-flash", messages=[{"role": "user", "content": "问题"}], max_tokens=0, settings=settings)
    asyncio.run(verify())


def test_history_pairs_and_current_message(settings, body):
    body["history"] = [{"id": "u1", "role": "user", "content": "旧问题"}, {"id": "a1", "role": "assistant", "content": "旧回答"}]
    request = RuntimeRequest.model_validate(body)
    messages = RuntimeService(settings).context(request, KnowledgeResult(status="no_match", chunks=[]))
    assert [m.content for m in messages] == ["只答问题", "旧问题", "旧回答", "你好"]
    body["history"][0]["id"] = body["userMessageId"]
    with pytest.raises(ValidationError):
        RuntimeRequest.model_validate(body)


def test_budget_drops_complete_oldest_pair(settings, body):
    settings.context_token_limit = 1024
    body["history"] = [{"id": "u1", "role": "user", "content": "x" * 500}, {"id": "a1", "role": "assistant", "content": "y" * 500}]
    request = RuntimeRequest.model_validate(body)
    messages = RuntimeService(settings).context(request, KnowledgeResult(status="no_match", chunks=[]))
    assert [m.content for m in messages] == ["只答问题", "你好"]
    body["message"] = "x" * 1100
    with pytest.raises(ModelError):
        RuntimeService(settings).context(RuntimeRequest.model_validate(body), KnowledgeResult(status="no_match", chunks=[]))


def test_provider_is_replaceable_and_scope_checked(settings, body):
    class KnowledgeStub:
        async def get_context(self, value):
            assert value.actorId == "user_test"
            return KnowledgeResult.model_validate({"status": "matched", "chunks": [{
                "citation": {"knowledgeBaseId": "kb1", "documentId": "d1", "chunkId": "c1", "title": "标题"},
                "content": "参考正文", "score": 0.8}]})

    body["agentConfig"]["knowledgeBaseIds"] = ["kb1"]
    async def verify():
        async with httpx.AsyncClient(transport=transport()) as client:
            service = RuntimeService(settings, knowledge=KnowledgeStub(), client=client)
            events = await collect(service, body)
            assert events[1]["type"] == "knowledge.result"
            assert events[-1]["data"]["citations"][0]["chunkId"] == "c1"
            body["agentConfig"]["knowledgeBaseIds"] = ["kb_other"]
            events = await collect(service, body)
            assert events[-1]["data"]["code"] == "KNOWLEDGE_UNAVAILABLE"
    asyncio.run(verify())


@pytest.mark.parametrize("field,code", [("knowledgeBaseIds", "KNOWLEDGE_UNAVAILABLE"), ("pluginIds", "TOOL_UNAVAILABLE")])
def test_unconfigured_provider_fails_explicitly(settings, body, field, code):
    body["agentConfig"][field] = ["bound"]
    events = asyncio.run(collect(RuntimeService(settings), body))
    assert events[-1]["data"]["code"] == code


def test_incremental_delivery_before_finish_and_close(settings):
    async def verify():
        gate = asyncio.Event()
        class PausedStream(httpx.AsyncByteStream):
            closed = False
            async def __aiter__(self):
                yield chunk("第一段").encode()
                await gate.wait()
                yield (chunk("第二段", "stop") + "data: [DONE]\n\n").encode()
            async def aclose(self):
                self.closed = True
        upstream = PausedStream()
        mock = httpx.MockTransport(lambda request: httpx.Response(200, stream=upstream, headers={"content-type": "text/event-stream"}))
        async with httpx.AsyncClient(transport=mock) as client:
            value = ModelInput(model="deepseek-flash", messages=[{"role": "user", "content": "问题"}])
            async with aclosing(stream_model(value, settings=settings, client=client)) as stream:
                assert await asyncio.wait_for(anext(stream), 1) == "第一段"
                assert not gate.is_set()
            assert upstream.closed
    asyncio.run(verify())


@pytest.mark.parametrize("which,expected", [("model", "MODEL_TIMEOUT"), ("run", "RUN_TIMEOUT")])
def test_timeouts_release_connection(settings, body, which, expected):
    async def verify():
        setattr(settings, which + "_timeout", 0.02)
        class WaitingStream(httpx.AsyncByteStream):
            closed = False
            async def __aiter__(self):
                await asyncio.Event().wait()
                yield b""
            async def aclose(self):
                self.closed = True
        source = WaitingStream()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=source, headers={"content-type": "text/event-stream"}))) as client:
            events = await collect(RuntimeService(settings, client=client), body)
        assert events[-1]["data"]["code"] == expected
        assert source.closed
    asyncio.run(verify())


def test_http_auth_validation_run_and_sse(settings, body, monkeypatch):
    monkeypatch.setattr(routes, "get_settings", lambda: settings)
    async def verify():
        async with httpx.AsyncClient(transport=transport()) as upstream:
            app.dependency_overrides[routes.get_runtime] = lambda: RuntimeService(settings, client=upstream)
            try:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
                    assert (await client.post("/internal/runtime/run", json=body)).status_code == 401
                    headers = {"Authorization": "Bearer test-internal"}
                    response = await client.post("/internal/runtime/run", json=body, headers=headers)
                    assert response.status_code == 200
                    assert response.json()["content"] == "你好"
                    response = await client.post("/internal/runtime/stream", json=body, headers=headers)
                    assert response.headers["content-type"].startswith("text/event-stream")
                    assert "event: message.delta" in response.text and "event: run.completed" in response.text
                    body["message"] = " "
                    response = await client.post("/internal/runtime/stream", json=body, headers=headers)
                    assert response.status_code == 400
                    assert set(response.json()) == {"statusCode", "message", "path", "timestamp"}
            finally:
                app.dependency_overrides.clear()
    asyncio.run(verify())


def test_missing_key_and_model_allowlist(settings, body):
    body["agentConfig"]["model"] = "untrusted-model"
    with pytest.raises(ModelError) as caught:
        RuntimeService(settings).preflight(RuntimeRequest.model_validate(body))
    assert caught.value.code == "INVALID_REQUEST"
    settings.deepseek_api_key = type(settings.deepseek_api_key)("")
    body["agentConfig"]["model"] = "deepseek-flash"
    with pytest.raises(ModelError) as caught:
        RuntimeService(settings).preflight(RuntimeRequest.model_validate(body))
    assert caught.value.code == "MODEL_NOT_CONFIGURED"


def test_sse_disconnect_cancels_upstream(settings, body):
    async def verify():
        entered = asyncio.Event()
        closed = asyncio.Event()
        class WaitingStream(httpx.AsyncByteStream):
            async def __aiter__(self):
                entered.set()
                await asyncio.Event().wait()
                yield b""
            async def aclose(self):
                closed.set()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(
            200, stream=WaitingStream(), headers={"content-type": "text/event-stream"}))) as client:
            service = RuntimeService(settings, client=client)
            async with aclosing(routes.sse_events(service, RuntimeRequest.model_validate(body))) as stream:
                assert "run.started" in await anext(stream)
                await asyncio.wait_for(entered.wait(), 1)
            await asyncio.wait_for(closed.wait(), 1)
    asyncio.run(verify())
