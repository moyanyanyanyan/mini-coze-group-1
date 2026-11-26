import asyncio
import copy
import io
import json

import httpx
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.api import runtime as routes
from app.runtime.schemas import RuntimeRequest, VisionPreflight
from app.runtime.service import RuntimeService
from app.runtime.images import MAX_BYTES, validate_bytes
from app.runtime import ModelError
from test_runtime import settings, body, stream_bytes
from test_tool_loop import Plugins, tool_stream, answer


def png(fmt='PNG'):
    out = io.BytesIO()
    Image.new('RGB', (32, 32), 'red').save(out, format=fmt)
    return out.getvalue()


@pytest.fixture
def vision(settings, body):
    settings.deepseek_base_url = 'https://api.siliconflow.cn/v1'
    settings.deepseek_model = 'deepseek-ai/DeepSeek-V4.1-Flash'
    settings.model_provider = 'siliconflow'
    body['agentConfig']['model'] = settings.deepseek_model
    body['images'] = [{'id': 'image-a', 'mimeType': 'image/png'}]
    return settings, body


@pytest.mark.parametrize('mutation', [
    lambda b: b.update(images=[{'id': '../x', 'mimeType': 'image/png'}]),
    lambda b: b['images'].append(b['images'][0]),
    lambda b: b['images'][0].update(url='http://external'),
    lambda b: b.update(message='', images=[]),
    lambda b: b.update(history=[{'id':'u','role':'user','content':'q'},
                              {'id':'a','role':'assistant','content':'a','images':b['images']}]),
])
def test_schema_rejects_invalid_images(vision, mutation):
    _, body = vision
    mutation(body)
    with pytest.raises(ValidationError):
        RuntimeRequest.model_validate(body)


def test_preflight_metadata_only_and_nonstream_rejection(vision, monkeypatch):
    settings, body = vision
    monkeypatch.setattr(routes, 'get_settings', lambda: settings)
    headers = {'Authorization': 'Bearer test-internal'}
    meta = {'agentConfig': body['agentConfig'], 'images': [dict(body['images'][0], width=32, height=32, byteSize=100)]}
    with TestClient(app) as client:
        assert client.post('/internal/runtime/preflight', json=meta).status_code == 401
        response = client.post('/internal/runtime/preflight', json=meta, headers=headers)
        assert response.status_code == 204 and response.content == b''
        assert client.post('/internal/runtime/run', json=body, headers=headers).headers['x-runtime-error-code'] == 'IMAGE_STREAM_ONLY'
        for field, value, code in [('byteSize', MAX_BYTES+1, 'IMAGE_TOO_LARGE'), ('width', 20_000_001, 'IMAGE_PIXEL_LIMIT')]:
            invalid = copy.deepcopy(meta); invalid['images'][0][field] = value
            assert client.post('/internal/runtime/preflight', json=invalid, headers=headers).headers['x-runtime-error-code'] == code
        meta['images'] *= 2
        assert client.post('/internal/runtime/preflight', json=meta, headers=headers).status_code == 400
        meta['images'] = [dict(meta['images'][0], id=f'image-{i}') for i in range(7)]
        assert client.post('/internal/runtime/preflight', json=meta, headers=headers).headers['x-runtime-error-code'] == 'IMAGE_CONTEXT_LIMIT'
        meta['images'] = meta['images'][:1]
        meta['agentConfig']['model'] = 'deepseek-ai/DeepSeek-V3.2'
        assert client.post('/internal/runtime/preflight', json=meta, headers=headers).headers['x-runtime-error-code'] == 'MODEL_VISION_UNSUPPORTED'


async def events_with_images(settings, body, image_handler, model_handler=None, plugins=None):
    async with httpx.AsyncClient(transport=httpx.MockTransport(image_handler)) as images:
        async with httpx.AsyncClient(transport=httpx.MockTransport(model_handler or (lambda r: httpx.Response(200, content=stream_bytes(), headers={'content-type':'text/event-stream'})))) as model:
            service = RuntimeService(settings, client=model, image_client=images, plugins=plugins)
            return [e async for e in service.events(RuntimeRequest.model_validate(body))]


@pytest.mark.parametrize('status,retryable', [(404,False),(403,False),(302,False),(500,True)])
def test_fetch_failure_never_calls_model(vision, status, retryable):
    settings, body = vision
    def model(r):
        pytest.fail('取图失败不得调用模型')
    events = asyncio.run(events_with_images(settings,body,lambda r:httpx.Response(status),model))
    assert [e['type'] for e in events] == ['run.started','run.failed']
    assert events[-1]['data']['code'] == 'IMAGE_FETCH_FAILED'
    assert events[-1]['data']['retryable'] is retryable


@pytest.mark.parametrize('fmt,mime', [('PNG','image/png'),('JPEG','image/jpeg'),('WEBP','image/webp')])
def test_images_reach_model_without_leaking_in_sse(vision, fmt, mime):
    settings, body = vision
    body['images'][0]['mimeType'] = mime
    body['message'] = ''
    body['agentConfig']['knowledgeBaseIds'] = ['kb-unused']
    seen=[]
    def image(r):
        assert r.headers['x-actor-id'] == body['actor']['id']
        assert r.headers['x-conversation-id'] == body['conversationId']
        assert r.headers['authorization'] == 'Bearer test-internal'
        assert r.url.path == '/internal/chat/images/image-a'
        return httpx.Response(200, content=png(fmt), headers={'content-type':mime})
    def model(r):
        assert r.headers['authorization'] != 'Bearer test-internal'
        content=json.loads(r.content)['messages'][-1]['content'];seen.append(content)
        assert len(content)==1 and content[0]['image_url']['url'].startswith('data:'+mime+';base64,')
        return httpx.Response(200,content=stream_bytes(),headers={'content-type':'text/event-stream'})
    events=asyncio.run(events_with_images(settings,body,image,model))
    assert events[-1]['type']=='run.completed' and seen
    assert 'base64' not in json.dumps(events)


def test_history_order_and_tool_roundtrip(vision):
    settings, body=vision
    body['history']=[{'id':'u','role':'user','content':'','images':[{'id':'old','mimeType':'image/png'}]},
                     {'id':'a','role':'assistant','content':'红色'}]
    body['agentConfig']['pluginIds']=['plugin_echo']
    requests=[]; reads=[]
    def image(r):
        reads.append(r.url.path)
        return httpx.Response(200,content=png(),headers={'content-type':'image/png'})
    def model(r):
        requests.append(json.loads(r.content)['messages'])
        return httpx.Response(200,content=tool_stream() if len(requests)==1 else answer(),headers={'content-type':'text/event-stream'})
    events=asyncio.run(events_with_images(settings,body,image,model,Plugins()))
    assert events[-1]['type']=='run.completed' and len(requests)==2
    assert reads==['/internal/chat/images/old','/internal/chat/images/image-a']
    assert requests[0][1]['role']=='user' and isinstance(requests[0][1]['content'],list)
    assert requests[1][:len(requests[0])]==requests[0]


def test_budget_does_not_silently_trim_image_history(vision):
    settings,body=vision;settings.context_token_limit=1024
    body['history']=[{'id':'u','role':'user','content':'x'*1100},{'id':'a','role':'assistant','content':'a'}]
    events=asyncio.run(events_with_images(settings,body,lambda r:httpx.Response(200,content=png(),headers={'content-type':'image/png'})))
    assert events[-1]['data']['code']=='IMAGE_CONTEXT_LIMIT'


@pytest.mark.parametrize('raw,mime,code', [(b'bad','image/png','IMAGE_DECODE_FAILED'),(png(),'image/jpeg','IMAGE_UNSUPPORTED')])
def test_decode_guards(raw,mime,code):
    with pytest.raises(ModelError) as error: validate_bytes(raw,mime)
    assert error.value.code==code


def test_image_http_sse_fetch_failure(vision, monkeypatch):
    settings,body=vision
    upstream=httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(404)))
    monkeypatch.setattr(routes,'get_settings',lambda:settings)
    monkeypatch.setitem(app.dependency_overrides,routes.get_runtime,lambda:RuntimeService(settings,image_client=upstream))
    with TestClient(app) as client:
        response=client.post('/internal/runtime/stream',json=body,headers={'Authorization':'Bearer test-internal'})
        assert response.status_code==200
        events=[json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
        assert [e['type'] for e in events]==['run.started','run.failed']
        assert events[-1]['data']['code']=='IMAGE_FETCH_FAILED'
        client.portal.call(upstream.aclose)

@pytest.mark.parametrize('kind,code', [('declared','IMAGE_TOO_LARGE'), ('actual','IMAGE_TOO_LARGE'),
                                      ('mismatch','IMAGE_FETCH_FAILED'), ('timeout','IMAGE_FETCH_FAILED')])
def test_download_size_and_timeout_guards(vision, monkeypatch, kind, code):
    from app.runtime import images
    settings,body=vision
    monkeypatch.setattr(images,'MAX_BYTES',100)
    def response(r):
        if kind=='timeout': raise httpx.ReadTimeout('test')
        if kind=='declared': return httpx.Response(200,headers={'content-type':'image/png','content-length':'101'},content=b'x')
        if kind=='mismatch': return httpx.Response(200,headers={'content-type':'image/png','content-length':'9'},content=b'x')
        return httpx.Response(200,headers={'content-type':'image/png'},content=b'x'*101)
    events=asyncio.run(events_with_images(settings,body,response))
    assert events[-1]['data']['code']==code
    assert events[-1]['type']=='run.failed'


def test_actual_pixel_limit(monkeypatch):
    from app.runtime import images
    monkeypatch.setattr(images,'MAX_PIXELS',100)
    with pytest.raises(ModelError) as error: validate_bytes(png(),'image/png')
    assert error.value.code=='IMAGE_PIXEL_LIMIT'


def test_disconnect_cancels_pending_image_fetch(vision):
    settings,body=vision
    async def verify():
        entered=asyncio.Event();cancelled=asyncio.Event()
        async def response(r):
            entered.set()
            try: await asyncio.Event().wait()
            finally: cancelled.set()
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
            source=RuntimeService(settings,image_client=client).events(RuntimeRequest.model_validate(body))
            assert (await anext(source))['type']=='run.started'
            task=asyncio.create_task(anext(source))
            await entered.wait();task.cancel()
            with pytest.raises(asyncio.CancelledError): await task
            await source.aclose()
            assert cancelled.is_set()
    asyncio.run(verify())
