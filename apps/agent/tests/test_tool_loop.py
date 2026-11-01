import asyncio
import json
from contextlib import aclosing

import httpx
import pytest

from app.runtime.service import RuntimeService
from app.runtime.schemas import RuntimeRequest, ToolDefinition, ToolSuccess, ToolFailure
from test_runtime import settings, body, collect


def wire(chunks, done=True):
    return (''.join('data: '+json.dumps(c, ensure_ascii=False)+'\n\n' for c in chunks)
            + ('data: [DONE]\n\n' if done else '')).encode()


def tool_stream(calls=None, done=True):
    calls = calls or [('call_1', 'echo_text', '{"text":"你好"}')]
    chunks = []
    for index, (call_id, name, arguments) in enumerate(calls):
        chunks.append({'choices':[{'delta':{'tool_calls':[{'index':index,'id':call_id,'type':'function',
            'function':{'name':name,'arguments':arguments[:4]}}]},'finish_reason':None}]})
        chunks.append({'choices':[{'delta':{'tool_calls':[{'index':index,'function':{'arguments':arguments[4:]}}]},'finish_reason':None}]})
    chunks.append({'choices':[{'delta':{},'finish_reason':'tool_calls'}],
                   'usage':{'prompt_tokens':10,'completion_tokens':5,'total_tokens':15}})
    return wire(chunks,done)


def answer():
    return wire([{'choices':[{'delta':{'content':'你好'},'finish_reason':'stop'}],
                  'usage':{'prompt_tokens':20,'completion_tokens':2,'total_tokens':22}}])


class Plugins:
    def __init__(self, error=None):
        self.calls=[]
        self.error=error

    async def list_tools(self, actorId, agentId, pluginIds):
        return [ToolDefinition(pluginId='plugin_echo',name='echo_text',description='回显',
            parameters={'type':'object','properties':{'text':{'type':'string'}},'required':['text'],'additionalProperties':False})]

    async def execute(self, request):
        self.calls.append(request)
        fields=dict(toolCallId=request.toolCallId,toolName=request.toolName)
        if self.error:
            return ToolFailure(**fields,error={'code':self.error,'message':'failed'},status='failed')
        return ToolSuccess(**fields,output={'echoed':request.arguments['text']},status='succeeded')


def run(settings, body, responses, plugins=None):
    body['agentConfig']['pluginIds']=['plugin_echo']
    plugins=plugins or Plugins()
    requests=[]
    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200,content=responses[min(len(requests)-1,len(responses)-1)],headers={'content-type':'text/event-stream'})
    async def verify():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            events=await collect(RuntimeService(settings,plugins=plugins,client=client),body)
        return events
    return asyncio.run(verify()),plugins,requests


def test_tool_roundtrip_and_usage(settings,body):
    events,plugins,requests=run(settings,body,[tool_stream(),answer()])
    assert [e['type'] for e in events]==['run.started','tool.started','tool.completed','message.delta','run.completed']
    assert [e['seq'] for e in events]==list(range(1,6))
    assert len(plugins.calls)==1 and plugins.calls[0].arguments=={'text':'你好'}
    assert plugins.calls[0].actorId==body['actor']['id']
    assert requests[0]['tools'][0]['function']['name']=='echo_text'
    followup=requests[1]['messages']
    assert followup[-2]['tool_calls'][0]['id']==followup[-1]['tool_call_id']=='call_1'
    assert json.loads(followup[-1]['content'])['output']['echoed']=='你好'
    assert events[-1]['data']['content']==''.join(e['data']['content'] for e in events if e['type']=='message.delta')
    assert events[-1]['data']['usage']['totalTokens']==37
    assert events[-1]['data']['toolResults'][0]['status']=='succeeded'


@pytest.mark.parametrize('calls,code',[
    ([('c','unbound_tool','{}')],'TOOL_FORBIDDEN'),
    ([('c','echo_text','{bad')],'TOOL_INVALID_ARGUMENTS'),
    ([('c','echo_text','[]')],'TOOL_INVALID_ARGUMENTS'),
    ([('c','echo_text','{"value":NaN}')],'TOOL_INVALID_ARGUMENTS'),
    ([('c','echo_text','{"text":"ok"}'),('c','echo_text','{}')],'TOOL_PROTOCOL_ERROR'),
    ([('c','echo_text','{"text":"ok"}'),('d','unknown','{}')],'TOOL_FORBIDDEN'),
])
def test_batch_validated_before_any_execution(settings,body,calls,code):
    events,plugins,_=run(settings,body,[tool_stream(calls)])
    assert events[-1]['type']=='run.failed' and events[-1]['data']['code']==code
    assert plugins.calls==[]


def test_incomplete_stream_never_executes(settings,body):
    events,plugins,_=run(settings,body,[tool_stream(done=False)])
    assert events[-1]['data']['code']=='MODEL_STREAM_INTERRUPTED'
    assert plugins.calls==[]


@pytest.mark.parametrize('error,continues',[('INVALID_ARGUMENTS',False),('TOOL_NOT_FOUND',False),('TIMEOUT',True),('TOOL_EXEC_ERROR',True)])
def test_business_failure_policy(settings,body,error,continues):
    events,plugins,requests=run(settings,body,[tool_stream(),answer()],Plugins(error))
    assert len(plugins.calls)==1
    assert events[2]['type']=='tool.completed' and events[2]['data']['status']=='failed'
    assert events[-1]['type']==('run.completed' if continues else 'run.failed')
    assert len(requests)==(2 if continues else 1)


def test_repeated_id_never_executes_twice(settings,body):
    events,plugins,_=run(settings,body,[tool_stream()])
    assert len(plugins.calls)==1
    assert events[-1]['data']['code']=='TOOL_PROTOCOL_ERROR'


def test_round_limit(settings,body):
    responses=[tool_stream([(f'call_{i}','echo_text','{"text":"x"}')]) for i in range(5)]
    events,plugins,_=run(settings,body,responses)
    assert len(plugins.calls)==4
    assert events[-1]['data']['code']=='TOOL_LIMIT_EXCEEDED'


def test_total_call_limit(settings,body):
    responses=[tool_stream([(f'call_{round_index}_{i}','echo_text','{"text":"x"}') for i in range(8)])
               for round_index in range(3)]
    events,plugins,_=run(settings,body,responses)
    assert len(plugins.calls)==16
    assert events[-1]['data']['code']=='TOOL_LIMIT_EXCEEDED'


def test_oversized_result_rejected(settings,body):
    class Large(Plugins):
        async def execute(self, request):
            return ToolSuccess(toolCallId=request.toolCallId,toolName=request.toolName,
                               status='succeeded',output='x'*16001)
    events,_,requests=run(settings,body,[tool_stream()],Large())
    assert events[-1]['data']['code']=='TOOL_RESULT_TOO_LARGE'
    assert len(requests)==1


def test_multiple_calls_preserve_protocol_pairs(settings,body):
    calls=[('first','echo_text','{"text":"one"}'),('second','echo_text','{"text":"two"}')]
    events,plugins,requests=run(settings,body,[tool_stream(calls),answer()])
    assert [c.toolCallId for c in plugins.calls]==['first','second']
    assert [m['tool_call_id'] for m in requests[1]['messages'][-2:]]==['first','second']
    assert events[-1]['type']=='run.completed'


def test_tool_run_nonstream_returns_same_structured_result(settings,body):
    body['agentConfig']['pluginIds']=['plugin_echo']
    async def verify():
        count=0
        def handler(request):
            nonlocal count
            count+=1
            return httpx.Response(200,content=tool_stream() if count==1 else answer(),headers={'content-type':'text/event-stream'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await RuntimeService(settings,plugins=Plugins(),client=client).run(RuntimeRequest.model_validate(body))
        assert result.content=='你好' and result.toolResults[0].status=='succeeded'
    asyncio.run(verify())


def test_tool_schema_budget_rejected_before_model(settings,body):
    settings.context_token_limit=1024
    body['agentConfig']['systemPrompt']='a'*700
    events,plugins,requests=run(settings,body,[answer()])
    assert events[-1]['data']['code']=='INVALID_REQUEST'
    assert requests==[] and plugins.calls==[]


def test_cancel_during_tool_execution(settings,body):
    class Blocking(Plugins):
        cancelled=False
        async def execute(self, request):
            try:
                await asyncio.Event().wait()
            finally:
                self.cancelled=True
    async def verify():
        body['agentConfig']['pluginIds']=['plugin_echo']
        plugins=Blocking()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,content=tool_stream(),headers={'content-type':'text/event-stream'}))) as client:
            async with aclosing(RuntimeService(settings,plugins=plugins,client=client).events(RuntimeRequest.model_validate(body))) as events:
                assert (await anext(events))['type']=='run.started'
                assert (await anext(events))['type']=='tool.started'
                task=asyncio.create_task(anext(events))
                await asyncio.sleep(0)
                task.cancel()
                with pytest.raises(asyncio.CancelledError):await task
                assert plugins.cancelled
    asyncio.run(verify())
