"""固定检索失败在Runtime HTTP/SSE入口的传播，不触发模型调用。"""
import json

from fastapi.testclient import TestClient
import httpx
import pytest

from app.main import app
from app.api import runtime as routes
from app.runtime.http_providers import HttpKnowledgeProvider
from app.runtime.service import RuntimeService
from test_runtime import settings, body


@pytest.mark.parametrize('status,code', [(503, 'KNOWLEDGE_UNAVAILABLE'), (403, 'KNOWLEDGE_FORBIDDEN')])
def test_retrieval_failure_http_and_sse_before_model(settings, body, monkeypatch, status, code):
    body['agentConfig']['knowledgeBaseIds'] = ['kb-1']
    calls = []

    def handler(request):
        calls.append(request.url.path)
        # 任何模型请求都会使此断言失败，不能用正常命中样例替代故障验收。
        assert request.url.path == '/internal/knowledge/retrieval'
        return httpx.Response(status, json={'code': status, 'message': 'test dependency failure', 'data': None})

    upstream = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    service = RuntimeService(settings, knowledge=HttpKnowledgeProvider(settings, upstream), client=upstream)
    monkeypatch.setattr(routes, 'get_settings', lambda: settings)
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[routes.get_runtime] = lambda: service
    try:
        with TestClient(app) as client:
            headers = {'Authorization': 'Bearer test-internal'}
            response = client.post('/internal/runtime/run', json=body, headers=headers)
            assert response.status_code == status
            assert response.headers['x-runtime-error-code'] == code
            response = client.post('/internal/runtime/stream', json=body, headers=headers)
            assert response.status_code == 200
            events = [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
            assert [event['type'] for event in events] == ['run.started', 'run.failed']
            assert [event['seq'] for event in events] == [1, 2]
            assert events[-1]['data']['code'] == code
            assert all(event['runId'] == body['runId'] for event in events)
            assert calls == ['/internal/knowledge/retrieval'] * 2
            # 在TestClient所用事件循环中关闭替身HTTP客户端。
            client.portal.call(upstream.aclose)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def test_unexpected_runtime_failure_http_and_sse(settings, body, monkeypatch):
    class BrokenKnowledge:
        async def get_context(self, request):
            raise RuntimeError('test-only internal detail')

    body['agentConfig']['knowledgeBaseIds'] = ['kb-1']
    service = RuntimeService(settings, knowledge=BrokenKnowledge())
    monkeypatch.setattr(routes, 'get_settings', lambda: settings)
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[routes.get_runtime] = lambda: service
    try:
        with TestClient(app) as client:
            headers = {'Authorization': 'Bearer test-internal'}
            response = client.post('/internal/runtime/run', json=body, headers=headers)
            assert response.status_code == 500
            assert response.headers['x-runtime-error-code'] == 'INTERNAL_ERROR'
            assert 'test-only internal detail' not in response.text
            response = client.post('/internal/runtime/stream', json=body, headers=headers)
            assert response.status_code == 200
            events = [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
            assert [event['type'] for event in events] == ['run.started', 'run.failed']
            assert events[-1]['data'] == {'code': 'INTERNAL_ERROR', 'message': '运行服务异常', 'retryable': False}
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
