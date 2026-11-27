import asyncio
import json
from contextlib import aclosing

import httpx
import pytest

from app.runtime.errors import ModelError
from app.runtime.observations import StageRecorder
from app.runtime.schemas import KnowledgeResult, RuntimeRequest
from app.runtime.service import RuntimeService
from app.api.runtime import runtime_error
from starlette.requests import Request
from test_runtime import settings, body, collect, transport
from test_tool_loop import run, tool_stream, answer, Plugins


def test_real_boundaries_and_each_model_round(settings, body):
    events, _, _ = run(settings, body, [tool_stream(), answer()])
    stages = events[-1]['data']['stages']
    assert [s['kind'] for s in stages] == ['context', 'model', 'tool', 'model']
    models = [s for s in stages if s['kind'] == 'model']
    assert [s['round'] for s in models] == [1, 2]
    assert [s['outcome'] for s in models] == ['tool_calls', 'answer']
    assert [s['usage']['totalTokens'] for s in models] == [15, 22]
    assert all(s['status'] == 'completed' and s['durationMs'] >= 0 for s in stages)
    assert len({s['stageId'] for s in stages}) == len(stages)
    assert stages[2]['toolCallId'] == 'call_1'
    assert 'arguments' not in json.dumps(stages)
    assert '你好' not in json.dumps(stages, ensure_ascii=False)


def test_tool_failure_is_not_success_even_if_model_recovers(settings, body):
    events, _, _ = run(settings, body, [tool_stream(), answer()], Plugins('UPSTREAM_ERROR'))
    assert events[-1]['type'] == 'run.completed'
    stage = next(s for s in events[-1]['data']['stages'] if s['kind'] == 'tool')
    assert stage['status'] == 'failed' and stage['errorCode'] == 'UPSTREAM_ERROR'


def test_retrieval_empty_and_context_counts(settings, body):
    class Knowledge:
        async def get_context(self, request):
            return KnowledgeResult(status='no_match', chunks=[])
    body['agentConfig']['knowledgeBaseIds'] = ['kb']
    async def verify():
        async with httpx.AsyncClient(transport=transport()) as client:
            result = await RuntimeService(settings, knowledge=Knowledge(), client=client).run(RuntimeRequest.model_validate(body))
        assert [s.kind for s in result.stages] == ['retrieval', 'context', 'model']
        assert result.stages[0].chunkCount == result.stages[1].chunkCount == 0
    asyncio.run(verify())


def test_failed_retrieval_survives_sse_and_http_error(settings, body):
    class Knowledge:
        async def get_context(self, request):
            raise ModelError('KNOWLEDGE_UNAVAILABLE', '检索失败', 503)
    body['agentConfig']['knowledgeBaseIds'] = ['kb']
    async def verify():
        service = RuntimeService(settings, knowledge=Knowledge())
        events = await collect(service, body)
        assert events[-1]['type'] == 'run.failed'
        assert events[-1]['data']['stages'][0]['status'] == 'failed'
        with pytest.raises(ModelError) as error:
            await service.run(RuntimeRequest.model_validate(body))
        response = await runtime_error(Request({'type': 'http', 'path': '/internal/runtime/run', 'headers': []}), error.value)
        assert response.status_code == 503
        assert json.loads(response.body)['stages'][0]['errorCode'] == 'KNOWLEDGE_UNAVAILABLE'
        assert len(error.value.stages) == 1
    asyncio.run(verify())


def test_cancellation_closes_source_without_inventing_completion():
    async def verify():
        trace = StageRecorder()
        closed = []
        async def source():
            try:
                yield 'partial'
                await asyncio.sleep(60)
            finally:
                closed.append(True)
        async with aclosing(trace.model(source(), 'model', 1)) as stream:
            assert await anext(stream) == 'partial'
        assert closed == [True]
        assert trace.stages[0].status == 'interrupted'
        assert trace.stages[0].usage is None
    asyncio.run(verify())


@pytest.mark.parametrize("with_tools", [False, True])
def test_bound_connection_keeps_model_stage_records(settings, body, with_tools):
    body["agentConfig"]["model"] = "bound-model"
    body["agentConfig"]["connection"] = {
        "protocol": "openai_compatible", "model": "bound-model",
        "baseUrl": "https://bound.example.invalid/v1", "apiKey": "bound-test-key",
    }
    body["agentConfig"]["pluginIds"] = ["plugin_echo"] if with_tools else []
    responses = [tool_stream(), answer()] if with_tools else [answer()]
    calls = []

    def handler(request):
        assert str(request.url) == "https://bound.example.invalid/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer bound-test-key"
        assert json.loads(request.content)["model"] == "bound-model"
        calls.append(request)
        return httpx.Response(200, content=responses[len(calls) - 1],
                              headers={"content-type": "text/event-stream"})

    async def verify():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            service = RuntimeService(settings, plugins=Plugins(), client=client)
            events = await collect(service, body)
        assert events[-1]["type"] == "run.completed"
        stages = events[-1]["data"]["stages"]
        models = [stage for stage in stages if stage["kind"] == "model"]
        assert len(models) == len(responses)
        assert all(stage["model"] == "bound-model" and stage["status"] == "completed" for stage in models)
        assert "bound-test-key" not in json.dumps(stages)
        assert (any(stage["kind"] == "tool" for stage in stages)) == with_tools

    asyncio.run(verify())
