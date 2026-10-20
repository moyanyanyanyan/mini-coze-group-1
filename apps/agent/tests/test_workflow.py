import asyncio
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.workflow.validation import validate, validate_input
from app.workflow.execution import execute
from app.workflow.runtime_adapter import RuntimeAdapter


@pytest.fixture
def definition():
    return json.loads((Path(__file__).resolve().parents[3] / 'docs/workflows/example.workflow.json').read_text())


def test_valid(definition):
    assert validate(definition) == {'valid': True, 'errors': []}


@pytest.mark.parametrize('mutation,code', [
    (lambda d: d.update(version=1), 'DEFINITION_VERSION_INVALID'),
    (lambda d: d['nodes'].append(copy.deepcopy(d['nodes'][0])), 'NODE_ID_DUPLICATE'),
    (lambda d: d['edges'][0].update(target='missing'), 'EDGE_NODE_NOT_FOUND'),
    (lambda d: d['edges'][0].update(target='node-start-1'), 'EDGE_SELF_LOOP'),
    (lambda d: d['edges'].append(dict(d['edges'][0], id='extra')), 'EDGE_DUPLICATE'),
    (lambda d: d['edges'].append(dict(id='cycle', source='node-end-1', target='node-start-1')), 'GRAPH_CYCLE'),
    (lambda d: d.update(edges=[]), 'ISOLATED_NODE'),
    (lambda d: d['nodes'][1]['data'].update(userPromptTemplate='{{node-end-1.result}}'), 'INVALID_REFERENCE'),
    (lambda d: d['nodes'][1]['data'].update(userPromptTemplate='{{broken'), 'INVALID_REFERENCE'),
    (lambda d: d['nodes'][2]['data']['outputs'][0].update(valueFrom='{{node-llm-1.text}}'), 'INVALID_REFERENCE'),
    (lambda d: d['nodes'][1]['data'].update(maxTokens=True), 'LLM_PARAM_OUT_OF_RANGE'),
    (lambda d: d['nodes'][1]['data'].update(temperature=3), 'LLM_PARAM_OUT_OF_RANGE'),
    (lambda d: d['nodes'][0]['data']['inputs'][0].update(type=[]), 'FIELD_TYPE_INVALID'),
    (lambda d: d['nodes'][0].update(type=[]), 'NODE_TYPE_INVALID'),
])
def test_invalid(definition, mutation, code):
    mutation(definition)
    assert code in [e['code'] for e in validate(definition)['errors']]


def test_inputs(definition):
    assert validate_input(definition, {})
    assert validate_input(definition, {'query': 123})
    assert not validate_input(definition, {'query': ''})
    entry = definition['nodes'][0]['data']['inputs'][0]
    entry['type'] = 'number'
    assert not validate_input(definition, {'query': 0})
    assert validate_input(definition, {'query': False})
    entry['type'] = 'boolean'
    assert not validate_input(definition, {'query': False})


def test_execution(definition):
    async def complete(**kwargs):
        assert kwargs['user_prompt'] == '你好'
        return {'text': '真实接口形状的测试结果', 'usage': {'totalTokens': 3}}
    result = asyncio.run(execute(definition, {'query': '你好'}, RuntimeAdapter(complete)))
    assert result['status'] == 'SUCCEEDED'
    assert result['output'] == {'result': '真实接口形状的测试结果'}
    assert len(result['nodeResults']) == 3


@pytest.mark.parametrize('failure,code', [(TimeoutError(), 'LLM_TIMEOUT'), (RuntimeError('secret-key'), 'LLM_UNAVAILABLE')])
def test_failure(definition, failure, code):
    async def complete(**kwargs):
        raise failure
    result = asyncio.run(execute(definition, {'query': 'hi'}, RuntimeAdapter(complete)))
    assert result['status'] == 'FAILED'
    assert [n['status'] for n in result['nodeResults']] == ['SUCCEEDED', 'FAILED', 'SKIPPED']
    assert result['nodeResults'][1]['error']['code'] == code
    assert 'secret-key' not in json.dumps(result)


def test_http(definition):
    with TestClient(app) as client:
        assert client.post('/internal/workflow/validate', json={'definition': definition}).json()['valid']
        assert client.post('/internal/workflow/run', json={'definition': definition, 'input': {}}).status_code == 400
        assert client.post('/internal/workflow/run', json={'definition': None, 'input': {}}).status_code == 422
        result = client.post('/internal/workflow/run', json={'definition': definition, 'input': {'query': 'hi'}})
        assert result.status_code == 200
        assert result.json()['status'] == 'FAILED'  # No silent mock fallback.
