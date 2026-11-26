"""真实 Runtime SSE + 真实模型；NestJS 取图/工具用固定内存替身，非端到端验收。"""
import io
import json

import httpx
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from app.main import app
from app.api import runtime as routes
from app.config import get_settings
from app.runtime.service import RuntimeService
from app.runtime.schemas import ToolDefinition, ToolSuccess


def picture(color, circle=False, fmt='PNG'):
    image = Image.new('RGB', (256, 256), 'white')
    draw = ImageDraw.Draw(image)
    (draw.ellipse if circle else draw.rectangle)((48, 48, 208, 208), fill=color)
    out = io.BytesIO()
    image.save(out, format=fmt)
    return out.getvalue()


class ReportTool:
    async def list_tools(self, actor_id, agent_id, plugin_ids):
        return [ToolDefinition(pluginId='report', name='report', description='记录图片颜色形状',
                               parameters={'type':'object','properties':{'description':{'type':'string'}},'required':['description']})]

    async def execute(self, request):
        return ToolSuccess(toolCallId=request.toolCallId, toolName=request.toolName,
                           status='succeeded', output={'recorded': request.arguments})


def main():
    settings = get_settings()
    fixtures = {'red': ('image/png', picture('red')), 'blue': ('image/png', picture('blue', True)),
                'webp': ('image/webp', picture('red', fmt='WEBP')),
                'jpeg': ('image/jpeg', picture('red', fmt='JPEG'))}
    reads = []
    def image_response(request):
        assert request.headers['authorization'] == 'Bearer ' + settings.internal_service_token.get_secret_value()
        image_id = request.url.path.rsplit('/', 1)[-1]
        reads.append(image_id)
        mime, data = fixtures[image_id]
        return httpx.Response(200, content=data, headers={'content-type': mime})
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(image_response))
    service = RuntimeService(settings, image_client=upstream, plugins=ReportTool())
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[routes.get_runtime] = lambda: service
    results = []
    try:
        with TestClient(app) as client:
            for case, ids, text in [('single',['red'],'用中文说颜色形状。'),('two',['red','blue'],'按顺序用中文说颜色形状。'),
                                   ('only',['red'],''),('webp',['webp'],'用中文说颜色形状。'),
                                   ('jpeg',['jpeg'],'用中文说颜色形状。'),('history',[],'上一张图片什么颜色形状？'),
                                   ('tools',['red'],'先用report记录这张图的颜色形状，再用中文回答。')]:
                body = dict(runId='image-smoke',actor={'id':'image-smoke-user'},conversationId='image-smoke-conv',
                    userMessageId='current-u',assistantMessageId='current-a',message=text,
                    agentConfig=dict(id='image-smoke-agent',revision=0,name='测试',systemPrompt='用中文简短回答。',
                        model=settings.deepseek_model,temperature=0.0,maxTokens=256,knowledgeBaseIds=[],
                        pluginIds=['report'] if case=='tools' else []),
                    history=[], images=[{'id':i,'mimeType':fixtures[i][0]} for i in ids])
                if case=='history':
                    body['history']=[{'id':'old-u','role':'user','content':'看看这张图。','images':[{'id':'red','mimeType':'image/png'}]},
                                     {'id':'old-a','role':'assistant','content':'已收到。'}]
                response=client.post('/internal/runtime/stream',json=body,
                    headers={'Authorization':'Bearer '+settings.internal_service_token.get_secret_value()})
                events=[json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
                last=events[-1] if events else {}
                answer=last.get('data',{}).get('content','')
                ok=response.status_code==200 and last.get('type')=='run.completed' and ('红' in answer or 'red' in answer.lower())
                if case=='two': ok=ok and ('蓝' in answer or 'blue' in answer.lower())
                if case=='tools': ok=ok and any(e['type']=='tool.completed' for e in events)
                assert 'base64,' not in response.text
                record={'case':case,'passed':ok,'events':[e['type'] for e in events], 'answer':answer,
                        'usage':last.get('data',{}).get('usage')}
                results.append(record)
                print(json.dumps(record,ensure_ascii=False),flush=True)
            client.portal.call(upstream.aclose)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
    assert all(item['passed'] for item in results), '存在失败样例，不能宣称通过'


if __name__ == '__main__':
    main()
