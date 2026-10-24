import asyncio
import json

import httpx
import pytest

from app.config import Settings
from app.runtime.errors import ModelError
from app.runtime.providers import HttpKnowledgeProvider
from app.runtime.schemas import KnowledgeRequest


def request():
    return KnowledgeRequest(runId="run-1", actorId="user-1", agentId="agent-1",
                            knowledgeBaseIds=["kb-1"], query="午餐上限是多少？")


def provider(handler):
    settings = Settings(_env_file=None, BACKEND_ORIGIN="http://nest.test", INTERNAL_SERVICE_TOKEN="test-token")
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return HttpKnowledgeProvider(settings, client), client


def test_hit_maps_citations_and_limits_public_context():
    def respond(req):
        assert req.url.path == "/internal/knowledge/retrieval"
        assert req.headers["Authorization"] == "Bearer test-token"
        assert json.loads(req.content)["topK"] == 5
        hit = {"knowledgeBaseId": "kb-1", "documentId": "doc-1", "chunkId": "chunk-1",
               "documentTitle": "餐费规则", "content": "午餐上限 40 元", "score": 0.8,
               "position": {"page": 3}}
        return httpx.Response(200, json={"code": 200, "message": "ok", "data": {
            "status": "HIT", "hits": [hit, {**hit, "score": 0.7}]}})

    async def verify():
        source, client = provider(respond)
        async with client:
            result = await source.get_context(request())
        assert result.status == "matched"
        assert len(result.chunks) == 1
        assert result.chunks[0].citation.title == "餐费规则"
        assert result.chunks[0].citation.position == {"page": 3}
        assert result.chunks[0].score == 0.8
    asyncio.run(verify())


def test_no_hit_remains_normal_result():
    source, client = provider(lambda _: httpx.Response(200, json={"code": 200, "message": "ok",
        "data": {"status": "NO_HIT", "hits": []}}))

    async def verify():
        async with client:
            assert (await source.get_context(request())).status == "no_match"
    asyncio.run(verify())


@pytest.mark.parametrize("status,code", [(401, "KNOWLEDGE_UNAUTHORIZED"),
                                           (403, "KNOWLEDGE_FORBIDDEN"),
                                           (503, "KNOWLEDGE_UNAVAILABLE")])
def test_http_failure_is_not_no_hit(status, code):
    source, client = provider(lambda _: httpx.Response(status, json={"code": status, "data": None}))

    async def verify():
        async with client:
            with pytest.raises(ModelError) as caught:
                await source.get_context(request())
        assert caught.value.code == code
    asyncio.run(verify())
