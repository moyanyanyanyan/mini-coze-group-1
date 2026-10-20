"""Definition v1 validation. All graph semantics live here, never in NestJS."""
import re

NAME = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
NODE_ID = re.compile(r'^[A-Za-z0-9_-]+$')
REF = re.compile(r'^([A-Za-z0-9_-]+)\.([A-Za-z_][A-Za-z0-9_]*)$')
TEMPLATE = re.compile(r'{{(.*?)}}', re.DOTALL)
TYPES = {'string': str, 'number': (int, float), 'boolean': bool}


def matches(value, kind):
    return isinstance(kind, str) and kind in TYPES and isinstance(value, TYPES[kind]) and not (kind == 'number' and isinstance(value, bool))


def validate(definition):
    errors = []
    def add(code, field, node=None, edge=None):
        errors.append(dict(code=code, message=f'{code}: {field}', nodeId=node, edgeId=edge, field=field))
    if not isinstance(definition, dict):
        add('DEFINITION_VERSION_INVALID', 'version')
        return dict(valid=False, errors=errors)
    if definition.get('version') != '1.0':
        add('DEFINITION_VERSION_INVALID', 'version')
    nodes, edges = definition.get('nodes'), definition.get('edges')
    if not isinstance(nodes, list) or not isinstance(edges, list):
        add('DEFINITION_STRUCTURE_INVALID', 'nodes/edges')
        return dict(valid=False, errors=errors)
    if len(nodes) > 50:
        add('WORKFLOW_TOO_LARGE', 'nodes')
    by_id = {}
    for node in nodes:
        if not isinstance(node, dict):
            add('NODE_ID_INVALID', 'id'); continue
        nid = node.get('id')
        if not isinstance(nid, str) or not NODE_ID.fullmatch(nid):
            add('NODE_ID_INVALID', 'id'); continue
        if nid in by_id:
            add('NODE_ID_DUPLICATE', 'id', nid)
        by_id[nid] = node
        if node.get('type') not in ('start', 'llm', 'end'):
            add('NODE_TYPE_INVALID', 'type', nid)
        pos = node.get('position')
        if not isinstance(pos, dict) or any(not matches(pos.get(k), 'number') for k in ('x', 'y')):
            add('NODE_POSITION_INVALID', 'position', nid)
        if not isinstance(node.get('data'), dict):
            add('NODE_DATA_INVALID', 'data', nid)
    for kind in ('start', 'end'):
        if sum(isinstance(n, dict) and n.get('type') == kind for n in nodes) != 1:
            add(f'{kind.upper()}_COUNT_INVALID', 'nodes')
    if sum(isinstance(n, dict) and n.get('type') == 'llm' for n in nodes) != 1:
        add('GRAPH_NOT_SINGLE_CHAIN', 'graph')
    incoming = {n: [] for n in by_id}
    outgoing = {n: [] for n in by_id}
    edge_ids, pairs = set(), set()
    for edge in edges:
        if not isinstance(edge, dict):
            add('EDGE_ID_INVALID', 'id'); continue
        eid, source, target = edge.get('id'), edge.get('source'), edge.get('target')
        if not isinstance(eid, str) or not eid:
            add('EDGE_ID_INVALID', 'id'); continue
        if eid in edge_ids:
            add('EDGE_ID_DUPLICATE', 'id', edge=eid)
        edge_ids.add(eid)
        if not isinstance(source, str) or not isinstance(target, str) or source not in by_id or target not in by_id:
            add('EDGE_NODE_NOT_FOUND', 'source/target', edge=eid); continue
        if source == target:
            add('EDGE_SELF_LOOP', 'target', edge=eid)
        if (source, target) in pairs:
            add('EDGE_DUPLICATE', 'source/target', edge=eid)
        pairs.add((source, target))
        incoming[target].append(source); outgoing[source].append(target)
    # Kahn traversal also detects cycles in disconnected components.
    degree = {n: len(v) for n, v in incoming.items()}
    queue = [n for n, d in degree.items() if d == 0]
    order = []
    while queue:
        nid = queue.pop(0); order.append(nid)
        for target in outgoing[nid]:
            degree[target] -= 1
            if degree[target] == 0:
                queue.append(target)
    if len(order) != len(by_id):
        add('GRAPH_CYCLE', 'graph')
    starts = [n for n in by_id if by_id[n].get('type') == 'start']
    reachable, pending = set(), starts[:]
    while pending:
        nid = pending.pop()
        if nid not in reachable:
            reachable.add(nid); pending.extend(outgoing[nid])
    fields = {}
    for nid, node in by_id.items():
        kind = node.get('type'); data = node.get('data')
        if not isinstance(data, dict):
            continue
        ins, outs = len(incoming[nid]), len(outgoing[nid])
        if kind == 'start' and ins:
            add('START_HAS_INBOUND', 'edges', nid)
        if kind == 'end' and outs:
            add('END_HAS_OUTBOUND', 'edges', nid)
        if (ins, outs) != {'start': (0, 1), 'llm': (1, 1), 'end': (1, 0)}.get(kind if isinstance(kind, str) else ''):
            add('GRAPH_NOT_SINGLE_CHAIN', 'graph', nid)
        if nid not in reachable:
            add('ISOLATED_NODE', 'graph', nid)
        if kind in ('start', 'end'):
            key, prefix = ('inputs', 'INPUT') if kind == 'start' else ('outputs', 'OUTPUT')
            entries = data.get(key)
            fields[nid] = {}
            if not isinstance(entries, list) or not entries:
                add('START_INPUT_REQUIRED' if kind == 'start' else 'END_OUTPUT_REQUIRED', f'data.{key}', nid); continue
            for i, entry in enumerate(entries):
                path = f'data.{key}[{i}]'
                if not isinstance(entry, dict):
                    add(f'{prefix}_NAME_INVALID', path, nid); continue
                name = entry.get('name')
                if not isinstance(name, str) or not NAME.fullmatch(name):
                    add(f'{prefix}_NAME_INVALID', path + '.name', nid); continue
                if name in fields[nid]:
                    add(f'{prefix}_NAME_DUPLICATE', path + '.name', nid)
                fields[nid][name] = entry.get('type')
                if not isinstance(entry.get('type'), str) or entry['type'] not in TYPES:
                    add('FIELD_TYPE_INVALID', path + '.type', nid)
                if kind == 'start' and not isinstance(entry.get('required'), bool):
                    add('INPUT_REQUIRED_INVALID', path + '.required', nid)
        elif kind == 'llm':
            fields[nid] = {'text': 'string'}
            if not isinstance(data.get('model'), str) or not data['model'].strip():
                add('LLM_MODEL_REQUIRED', 'data.model', nid)
            if not isinstance(data.get('userPromptTemplate'), str) or not data['userPromptTemplate'].strip():
                add('LLM_PROMPT_REQUIRED', 'data.userPromptTemplate', nid)
            temp, tokens = data.get('temperature', .7), data.get('maxTokens', 2048)
            if not matches(temp, 'number') or not 0 <= temp <= 2:
                add('LLM_PARAM_OUT_OF_RANGE', 'data.temperature', nid)
            if type(tokens) is not int or not 1 <= tokens <= 8192:
                add('LLM_PARAM_OUT_OF_RANGE', 'data.maxTokens', nid)
            if 'outputs' in data and data['outputs'] != [{'name': 'text', 'type': 'string'}]:
                add('LLM_OUTPUT_INVALID', 'data.outputs', nid)
    def reference(value, nid, path, expected=None):
        match = REF.fullmatch(value) if isinstance(value, str) else None
        if not match:
            add('INVALID_REFERENCE', path, nid); return
        source, field = match.groups()
        upstream, stack = set(), incoming[nid][:]
        while stack:
            item = stack.pop()
            if item not in upstream:
                upstream.add(item); stack.extend(incoming[item])
        if source == nid or source not in upstream or by_id[source].get('type') == 'end' or field not in fields.get(source, {}):
            add('INVALID_REFERENCE', path, nid)
        elif expected and fields[source][field] != expected:
            add('OUTPUT_TYPE_MISMATCH', path, nid)
    for nid, node in by_id.items():
        data = node.get('data')
        if not isinstance(data, dict): continue
        if node.get('type') == 'llm':
            for key in ('userPromptTemplate', 'systemPrompt'):
                value = data.get(key, '')
                if not isinstance(value, str):
                    add('INVALID_REFERENCE', f'data.{key}', nid); continue
                for match in TEMPLATE.finditer(value):
                    reference(match.group(1), nid, f'data.{key}')
                remaining = TEMPLATE.sub('', value)
                if '{{' in remaining or '}}' in remaining:
                    add('INVALID_REFERENCE', f'data.{key}', nid)
        if node.get('type') == 'end' and isinstance(data.get('outputs'), list):
            for i, entry in enumerate(data['outputs']):
                if isinstance(entry, dict):
                    reference(entry.get('valueFrom'), nid, f'data.outputs[{i}].valueFrom', entry.get('type'))
    return dict(valid=not errors, errors=errors)


def validate_input(definition, values):
    errors = []
    start = next(n for n in definition['nodes'] if n['type'] == 'start')
    for entry in start['data']['inputs']:
        name = entry['name']
        if (name not in values and entry['required']) or (name in values and not matches(values[name], entry['type'])):
            errors.append(dict(code='INVALID_INPUT', message=f'输入缺失或类型错误: {name}', nodeId=start['id'], edgeId=None, field=f'input.{name}'))
    return errors
