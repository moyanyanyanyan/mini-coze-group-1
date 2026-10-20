import asyncio
import json
import time

from .validation import TEMPLATE


def resolve(ref, outputs):
    node, field = ref.split('.')
    return outputs[node][field]


def render(template, outputs):
    def replace(match):
        value = resolve(match.group(1), outputs)
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return TEMPLATE.sub(replace, template)


class StartExecutor:
    async def execute(self, data, values, outputs, runtime):
        return {entry['name']: values[entry['name']] for entry in data['inputs'] if entry['name'] in values}


class LlmExecutor:
    async def execute(self, data, values, outputs, runtime):
        return await runtime.invoke(model=data['model'], system_prompt=render(data.get('systemPrompt', ''), outputs),
                                    user_prompt=render(data['userPromptTemplate'], outputs),
                                    temperature=data.get('temperature', .7), max_tokens=data.get('maxTokens', 2048))


class EndExecutor:
    async def execute(self, data, values, outputs, runtime):
        return {entry['name']: resolve(entry['valueFrom'], outputs) for entry in data['outputs']}


EXECUTORS = {'start': StartExecutor(), 'llm': LlmExecutor(), 'end': EndExecutor()}


async def execute(definition, values, runtime):
    by_id = {n['id']: n for n in definition['nodes']}
    next_node = {e['source']: e['target'] for e in definition['edges']}
    node = next(n for n in definition['nodes'] if n['type'] == 'start')
    outputs, results = {}, []
    failure = None
    while node:
        nid, kind, data = node['id'], node['type'], node['data']
        record = dict(nodeId=nid, type=kind, status='SKIPPED', input={}, output=None, error=None, durationMs=0)
        if failure is None:
            started = time.monotonic()
            try:
                record['input'] = (values if kind == 'start' else
                                   {entry['name']: resolve(entry['valueFrom'], outputs) for entry in data['outputs']} if kind == 'end' else
                                   dict(outputs[next(e['source'] for e in definition['edges'] if e['target'] == nid)]))
                output = await EXECUTORS[kind].execute(data, values, outputs, runtime)
                outputs[nid] = output
                record.update(status='SUCCEEDED', output=output)
            except Exception as exc:
                code = 'LLM_TIMEOUT' if isinstance(exc, (TimeoutError, asyncio.TimeoutError)) else 'LLM_UNAVAILABLE' if kind == 'llm' else 'NODE_EXECUTION_FAILED'
                # Never expose provider exception text (it may contain credentials).
                record.update(status='FAILED', error=dict(code=code, message='模型调用超时' if code == 'LLM_TIMEOUT' else '节点执行失败'))
                failure = dict(code='NODE_EXECUTION_FAILED', message='节点执行失败', nodeId=nid)
            record['durationMs'] = int((time.monotonic() - started) * 1000)
        results.append(record)
        node = by_id.get(next_node.get(nid))
    return dict(status='FAILED' if failure else 'SUCCEEDED', output=None if failure else results[-1]['output'], nodeResults=results, error=failure)
