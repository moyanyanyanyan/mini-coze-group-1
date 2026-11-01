"""真实工具循环验收；使用已启动的插件服务，凭证由本地环境提供。"""
import argparse
import asyncio
import json
from pathlib import Path
import secrets
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.runtime.service import RuntimeService
from app.runtime.schemas import RuntimeRequest
from app.runtime.http_providers import HttpPluginProvider


async def verify(use_http=False):
    settings = get_settings()
    body = RuntimeRequest.model_validate({
        'runId': 'tools_'+secrets.token_hex(8), 'actor': {'id': 'integration-user'},
        'conversationId': 'integration-conversation', 'userMessageId': 'user-message',
        'assistantMessageId': 'assistant-message',
        'agentConfig': {'id': 'integration-agent', 'revision': 0, 'name': '工具验收',
            'systemPrompt': '遵守用户要求使用提供的工具，不要模拟工具结果。',
            'model': settings.deepseek_model, 'temperature': 0.0, 'maxTokens': 512,
            'knowledgeBaseIds': [], 'pluginIds': ['plugin_echo', 'plugin_time']},
        'history': [],
        'message': '必须先调用echo_text，text参数为WEEK3_RUNTIME_OK，再调用current_time获取当前时间，最后根据两个工具的真实返回简短回答。',
    })
    if use_http:
        from fastapi.testclient import TestClient
        from app.main import app
        token = settings.internal_service_token.get_secret_value()
        if not token:
            raise RuntimeError('HTTP验收需要配置内部服务凭证')
        with TestClient(app) as http:
            headers={'Authorization': 'Bearer '+token}
            response=http.post('/internal/runtime/run',json=body.model_dump(),headers=headers)
            assert response.status_code==200 and response.json()['status']=='completed'
            assert {'echo_text','current_time'} <= {r['toolName'] for r in response.json()['toolResults']}
            body.runId='tools_'+secrets.token_hex(8)
            with http.stream('POST','/internal/runtime/stream',json=body.model_dump(),headers=headers) as response:
                assert response.status_code==200
                events=[json.loads(line[5:]) for line in response.iter_lines() if line.startswith('data:')]
    else:
        service = RuntimeService(settings, plugins=HttpPluginProvider(settings))
        events = [event async for event in service.events(body)]
    assert events[-1]['type'] == 'run.completed', events[-1]
    assert [e['seq'] for e in events] == list(range(1, len(events)+1))
    final = events[-1]['data']
    calls = final['toolResults']
    assert {'echo_text', 'current_time'} <= {call['toolName'] for call in calls}
    assert all(call['status']=='succeeded' for call in calls)
    assert any(call.get('output',{}).get('echoed')=='WEEK3_RUNTIME_OK' for call in calls)
    assert final['content'] == ''.join(e['data']['content'] for e in events if e['type']=='message.delta')
    print(json.dumps({'model': settings.deepseek_model, 'status':'passed', 'mode':'run_and_stream_asgi' if use_http else 'service',
        'eventCount':len(events),'toolNames':[r['toolName'] for r in calls],
        'usage':final['usage'],'content':final['content']},ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', help='允许真实模型与插件调用；仅用可安全执行的测试工具')
    parser.add_argument('--http', action='store_true', help='经真实FastAPI应用的run/stream入口验证；使用TestClient ASGI传输')
    args=parser.parse_args()
    if not args.live:
        parser.error('真实验收需要显式 --live')
    asyncio.run(verify(args.http))
