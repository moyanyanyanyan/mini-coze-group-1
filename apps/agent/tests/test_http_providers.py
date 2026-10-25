import asyncio
import json

import httpx
import pytest

from app.config import Settings
from app.runtime.errors import ModelError
from app.runtime.http_providers import HttpKnowledgeProvider, HttpPluginProvider
from app.runtime.schemas import KnowledgeRequest, ToolRequest


@pytest.fixture
def settings():
    return Settings(_env_file=None, INTERNAL_SERVICE_TOKEN="test-internal", PLUGINS_SERVICE_TOKEN="test-plugin")


def knowledge_request():
    return KnowledgeRequest(runId="r", actorId="u", agentId="a", knowledgeBaseIds=["kb1", "kb2"], query="问题", topK=5)


def hit(index=0, kb="kb1"):
    return {"knowledgeBaseId": kb, "documentId": "doc1", "chunkId": str(index), "documentTitle": "规则",
            "content": "参考内容", "score": index / 100, "position": {"page": 2}}


def wrapped(data):
    return httpx.Response(200, json={"code": 200, "message": "ok", "data": data})


def test_retrieval_http_and_mapping(settings):
    async def verify():
        def handler(request):
            assert request.url.path == "/internal/knowledge/retrieval"
            assert request.headers["Authorization"] == "Bearer test-internal"
            assert "workspaceId" not in json.loads(request.content)
            assert json.loads(request.content) == knowledge_request().model_dump()
            return wrapped({"status": "HIT", "hits": [hit(1)]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await HttpKnowledgeProvider(settings, client).get_context(knowledge_request())
        assert result.status == "matched"
        assert result.chunks[0].citation.title == "规则"
        assert result.chunks[0].citation.position == {"page": 2}
    asyncio.run(verify())


def test_retrieval_multibase_keeps_per_kb_candidates(settings):
    async def verify():
        data = {"status": "HIT", "hits": [hit(i, "kb1" if i < 5 else "kb2") for i in range(10)]}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: wrapped(data))) as client:
            result = await HttpKnowledgeProvider(settings, client).get_context(knowledge_request())
        assert [c.citation.chunkId for c in result.chunks] == [str(i) for i in range(9, -1, -1)]
    asyncio.run(verify())


def test_retrieval_ten_kbs_accepts_fifty_candidates(settings):
    async def verify():
        request = knowledge_request()
        request.knowledgeBaseIds = [f"kb{i}" for i in range(10)]
        data = {"status": "HIT", "hits": [hit(i * 5 + j, f"kb{i}") for i in range(10) for j in range(5)]}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: wrapped(data))) as client:
            result = await HttpKnowledgeProvider(settings, client).get_context(request)
        assert len(result.chunks) == 50
        assert result.chunks[0].citation.chunkId == "49"
    asyncio.run(verify())


@pytest.mark.parametrize("data,valid", [
    ({"status": "NO_HIT", "hits": []}, True),
    ({"status": "NO_HIT", "hits": [hit()]}, False),
    ({"status": "HIT", "hits": []}, False),
    ({"status": "HIT", "hits": [hit(kb="forbidden")]}, False),
    ({"status": "HIT", "hits": [{}]}, False),
])
def test_retrieval_never_masks_invalid_as_no_hit(settings, data, valid):
    async def verify():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: wrapped(data))) as client:
            provider = HttpKnowledgeProvider(settings, client)
            if valid:
                result = await provider.get_context(knowledge_request())
                assert result.status == "no_match" and result.chunks == []
            else:
                with pytest.raises(ModelError) as caught:
                    await provider.get_context(knowledge_request())
                assert caught.value.code == "KNOWLEDGE_PROTOCOL_ERROR"
    asyncio.run(verify())


@pytest.mark.parametrize("status,code", [(401, "KNOWLEDGE_UNAUTHORIZED"), (403, "KNOWLEDGE_FORBIDDEN"), (500, "KNOWLEDGE_UNAVAILABLE")])
def test_retrieval_http_failure(settings, status, code):
    async def verify():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(status))) as client:
            with pytest.raises(ModelError) as caught:
                await HttpKnowledgeProvider(settings, client).get_context(knowledge_request())
            assert caught.value.code == code
    asyncio.run(verify())


def test_retrieval_dedup_and_whole_chunk_budget(settings):
    async def verify():
        duplicate = hit(1)
        duplicate["score"] = 0.99
        oversize = hit(10)
        oversize.update(content="长" * 12001, score=1.0)
        data = {"status": "HIT", "hits": [hit(1), duplicate, oversize, hit(2)]}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: wrapped(data))) as client:
            result = await HttpKnowledgeProvider(settings, client).get_context(knowledge_request())
        assert [c.citation.chunkId for c in result.chunks] == ["1", "2"]
        assert result.chunks[0].score == 0.99
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: wrapped({"status": "HIT", "hits": [oversize]}))) as client:
            with pytest.raises(ModelError) as caught:
                await HttpKnowledgeProvider(settings, client).get_context(knowledge_request())
            assert caught.value.code == "KNOWLEDGE_CONTEXT_TOO_LARGE"
    asyncio.run(verify())


def test_dependency_timeout_and_bad_envelope(settings):
    async def verify():
        def timeout(request):
            raise httpx.ReadTimeout("not forwarded")
        async with httpx.AsyncClient(transport=httpx.MockTransport(timeout)) as client:
            with pytest.raises(ModelError) as caught:
                await HttpKnowledgeProvider(settings, client).get_context(knowledge_request())
            assert caught.value.code == "KNOWLEDGE_TIMEOUT"
            assert caught.value.status == 504
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": 403, "data": None}))) as client:
            with pytest.raises(ModelError) as caught:
                await HttpKnowledgeProvider(settings, client).get_context(knowledge_request())
            assert caught.value.code == "KNOWLEDGE_PROTOCOL_ERROR"
    asyncio.run(verify())


def test_plugin_repeated_query_and_credentials(settings):
    async def verify():
        def handler(request):
            assert request.url.path == "/api/tools"
            assert request.url.params.get_list("pluginIds") == ["plugin_echo", "plugin_time"]
            assert request.headers["x-plugin-service-token"] == "test-plugin"
            assert "authorization" not in request.headers
            return wrapped([{"pluginId": "plugin_echo", "name": "echo_text", "description": "回显", "parameters": {"type": "object"}}])
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            tools = await HttpPluginProvider(settings, client).list_tools("u", "a", ["plugin_echo", "plugin_time", "plugin_echo"])
        assert tools[0].name == "echo_text"
    asyncio.run(verify())


@pytest.mark.parametrize("success", [True, False])
def test_plugin_result_keeps_business_failure(settings, success):
    async def verify():
        request = ToolRequest(runId="r", actorId="u", agentId="a", toolCallId="c", toolName="echo_text", arguments={"text": "你好"})
        def handler(http_request):
            assert http_request.url.path == "/api/tools/execute"
            assert json.loads(http_request.content) == request.model_dump()
            result = {"toolCallId": "c", "toolName": "echo_text", "status": "succeeded" if success else "failed"}
            result.update({"output": {"echoed": "你好"}} if success else {"error": {"code": "INVALID_ARGUMENTS", "message": "输入非法"}})
            return wrapped(result)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await HttpPluginProvider(settings, client).execute(request)
        assert result.status == ("succeeded" if success else "failed")
        if not success:
            assert result.error["code"] == "INVALID_ARGUMENTS"
    asyncio.run(verify())


def test_plugin_wrong_scope_and_mismatched_call(settings):
    async def verify():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: wrapped([
            {"pluginId": "unbound", "name": "bad", "description": "bad", "parameters": {}}]))) as client:
            with pytest.raises(ModelError) as caught:
                await HttpPluginProvider(settings, client).list_tools("u", "a", ["plugin_echo"])
            assert caught.value.code == "TOOL_PROTOCOL_ERROR"
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: wrapped({
            "toolCallId": "other", "toolName": "echo_text", "status": "succeeded", "output": {}}))) as client:
            with pytest.raises(ModelError) as caught:
                await HttpPluginProvider(settings, client).execute(ToolRequest(runId="r", actorId="u", agentId="a", toolCallId="c", toolName="echo_text", arguments={}))
            assert caught.value.code == "TOOL_PROTOCOL_ERROR"
    asyncio.run(verify())


def test_missing_credentials_do_not_fall_back_to_open_access():
    async def verify():
        settings = Settings(_env_file=None)
        with pytest.raises(ModelError) as caught:
            await HttpKnowledgeProvider(settings).get_context(knowledge_request())
        assert caught.value.code == "KNOWLEDGE_NOT_CONFIGURED"
        with pytest.raises(ModelError) as caught:
            await HttpPluginProvider(settings).list_tools("u", "a", ["plugin_echo"])
        assert caught.value.code == "TOOL_NOT_CONFIGURED"
    asyncio.run(verify())
