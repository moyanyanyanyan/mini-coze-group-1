"""验证真实路由到模型请求的偏好注入，不依赖模型随机遵循指令。"""
import asyncio
import copy
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api import runtime as routes
from app.runtime import ModelError, ModelResult, call_model
from app.runtime.schemas import RuntimeRequest, KnowledgeResult
from app.runtime.service import RuntimeService
from app.workflow import runtime_adapter
from app.workflow.execution import execute
from app.workflow.runtime_adapter import RuntimeAdapter
from test_runtime import settings, body, stream_bytes
from test_tool_loop import run, tool_stream, answer
from test_workflow_nodes import looping


@pytest.mark.parametrize('path', ['run', 'stream'])
@pytest.mark.parametrize('prompt', ['', '  ', '请简短回答 {{s.query}}', '偏' * 4000])
def test_chat_http_injection(settings, body, monkeypatch, path, prompt):
    body['globalPrompt'] = prompt
    body['history'] = [{'id': 'u', 'role': 'user', 'content': '旧问题'},
                       {'id': 'a', 'role': 'assistant', 'content': '旧回答'}]
    original = copy.deepcopy(body)
    requests = []
    def handler(request):
        requests.append(json.loads(request.content)['messages'])
        return httpx.Response(200, content=stream_bytes(), headers={'content-type': 'text/event-stream'})
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    service = RuntimeService(settings, client=upstream)
    monkeypatch.setattr(routes, 'get_settings', lambda: settings)
    monkeypatch.setitem(app.dependency_overrides, routes.get_runtime, lambda: service)
    with TestClient(app) as client:
        response = client.post('/internal/runtime/' + path, json=body,
                               headers={'Authorization': 'Bearer test-internal'})
        assert response.status_code == 200
        assert 'completed' in response.text
        client.portal.call(upstream.aclose)
    messages = requests[0]
    assert messages[0]['role'] == 'system'
    assert messages[0]['content'].startswith('只答问题')
    assert messages[-3:] == [{'role': 'user', 'content': '旧问题'},
                            {'role': 'assistant', 'content': '旧回答'},
                            {'role': 'user', 'content': '你好'}]
    if prompt.strip():
        assert messages[1] == {'role': 'user', 'content': '用户补充偏好：\n' + prompt}
        assert prompt not in messages[0]['content']
    else:
        assert messages[0]['content'] == '只答问题'
        assert len(messages) == 4
    assert body == original


@pytest.mark.parametrize('prompt', [None, 7, {}, 'x' * 4001])
def test_invalid_prompt_rejected_on_both_routes(settings, body, load_example, monkeypatch, prompt):
    monkeypatch.setattr(routes, 'get_settings', lambda: settings)
    with TestClient(app) as client:
        for path in ['run', 'stream']:
            response = client.post('/internal/runtime/' + path, json={**body, 'globalPrompt': prompt},
                                   headers={'Authorization': 'Bearer test-internal'})
            assert response.status_code == 400
        response = client.post('/internal/workflow/run', json={
            'definition': load_example(), 'input': {'query': 'hi'}, 'globalPrompt': prompt})
        assert response.status_code == 400


def test_tool_rounds_keep_single_prompt(settings, body):
    body['globalPrompt'] = '使用简短中文'
    events, _, requests = run(settings, body, [tool_stream(), answer()])
    assert events[-1]['type'] == 'run.completed'
    assert len(requests) == 2
    for request in requests:
        assert sum(m.get('content') == '用户补充偏好：\n使用简短中文' for m in request['messages']) == 1
        assert request['messages'][1]['role'] == 'user'


def test_chat_budget_includes_global_prompt(settings, body):
    settings.context_token_limit = 1024
    body['globalPrompt'] = 'x' * 1100
    with pytest.raises(ModelError, match='预算'):
        RuntimeService(settings).context(RuntimeRequest.model_validate(body), KnowledgeResult(status='no_match', chunks=[]))


@pytest.mark.parametrize('prompt', ['', '偏好 {{node-start-1.query}}', '偏' * 4000])
def test_workflow_http_injection_and_no_template_expansion(load_example, monkeypatch, prompt):
    calls = []
    async def model(**kwargs):
        calls.append(kwargs['messages'])
        return ModelResult(content='ok', finishReason='stop')
    monkeypatch.setattr(runtime_adapter, 'call_model', model)
    definition = load_example()
    original = copy.deepcopy(definition)
    with TestClient(app) as client:
        response = client.post('/internal/workflow/run', json={
            'definition': definition, 'input': {'query': '本轮问题'},
            'actor': {'id': 'user-a'}, 'globalPrompt': prompt})
    assert response.status_code == 200
    assert response.json()['status'] == 'SUCCEEDED'
    assert calls[0][0]['content'].startswith('你是一个助手')
    assert calls[0][-1] == {'role': 'user', 'content': '本轮问题'}
    if prompt:
        assert calls[0][1] == {'role': 'user', 'content': '用户补充偏好：\n' + prompt}
    else:
        assert len(calls[0]) == 2
    assert definition == original


def test_concurrent_workflow_loops_isolate_snapshots(monkeypatch):
    calls = []
    async def model(**kwargs):
        await asyncio.sleep(0)
        messages = kwargs['messages']
        calls.append(messages)
        return ModelResult(content=messages[-1]['content'], finishReason='stop')
    monkeypatch.setattr(runtime_adapter, 'call_model', model)
    async def verify():
        return await asyncio.gather(*[
            execute(looping(), {'questions': [name + '1', name + '2']},
                    RuntimeAdapter(runtime_adapter.runtime_complete, global_prompt=name))
            for name in ['用户甲', '用户乙']
        ])
    results = asyncio.run(verify())
    assert all(result['status'] == 'SUCCEEDED' for result in results)
    assert len(calls) == 4
    for messages in calls:
        name = '用户甲' if '用户甲' in messages[-1]['content'] else '用户乙'
        assert messages[1]['content'] == '用户补充偏好：\n' + name


def test_workflow_budget_includes_global_prompt(settings, monkeypatch):
    settings.context_token_limit = 1024
    async def limited_model(**kwargs):
        return await call_model(**kwargs, settings=settings)
    monkeypatch.setattr(runtime_adapter, 'call_model', limited_model)
    with pytest.raises(ModelError, match='预算'):
        asyncio.run(runtime_adapter.runtime_complete(model='deepseek-flash', system_prompt='S',
            user_prompt='hi', temperature=0.7, max_tokens=128, global_prompt='x' * 1100))
