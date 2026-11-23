"""Definition v1 validation. All graph semantics live here, never in NestJS."""

import re

from .conditions import ARRAYS, UNARY, is_type, matches, operators, right_type

NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
NODE_ID = re.compile(r"^[A-Za-z0-9_-]+$")
REF = re.compile(r"^([A-Za-z0-9_-]+)\.([A-Za-z_][A-Za-z0-9_]*)$")
TEMPLATE = re.compile(r"{{(.*?)}}", re.DOTALL)
MAX_NODES = 50
MAX_BRANCHES = 10
MAX_CONDITIONS = 10
MAX_LOOP = 50
TOP_TYPES = ("start", "llm", "end", "condition", "loop")
BODY_TYPES = ("llm", "condition")


def ports(node):
    """condition 节点的出口：[(错误字段路径, 出口 id)]，末尾为隐式 else。"""
    data = node.get("data")
    branches = data.get("branches") if isinstance(data, dict) else None
    result = []
    if isinstance(branches, list):
        for i, branch in enumerate(branches):
            if isinstance(branch, dict) and isinstance(branch.get("id"), str):
                result.append((f"data.branches[{i}]", branch["id"]))
    return result + [("else", "else")]


def validate(definition):
    """收集定义、节点、连线和引用错误，返回 valid 与结构化 errors。"""
    errors = []

    def add(code, field, node=None, edge=None):
        errors.append(
            dict(
                code=code,
                message=f"{code}: {field}",
                nodeId=node,
                edgeId=edge,
                field=field,
            )
        )

    if not isinstance(definition, dict):
        add("DEFINITION_VERSION_INVALID", "version")
        return dict(valid=False, errors=errors)
    if definition.get("version") != "1.0":
        add("DEFINITION_VERSION_INVALID", "version")
    nodes, edges = definition.get("nodes"), definition.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        add("DEFINITION_STRUCTURE_INVALID", "nodes/edges")
        return dict(valid=False, errors=errors)
    # 第一、二阶段：逐张图（顶层、循环体）建立节点与连线索引，检查结构。
    by_id, graph_of, body_of, edge_ids = {}, {}, {}, set()

    def check_graph(nodes, edges, loop):
        """检查一张图；loop 为所属循环节点 id，顶层为 None。返回图索引。"""
        graph = dict(loop=loop, ids=[], incoming={}, outgoing={})
        incoming, outgoing, bodies = graph["incoming"], graph["outgoing"], []
        for node in nodes:
            if not isinstance(node, dict):
                add("NODE_ID_INVALID", "id")
                continue
            nid = node.get("id")
            if not isinstance(nid, str) or not NODE_ID.fullmatch(nid):
                add("NODE_ID_INVALID", "id")
                continue
            if nid in by_id:
                add("NODE_ID_DUPLICATE", "id", nid)
                continue
            by_id[nid], graph_of[nid] = node, graph
            graph["ids"].append(nid)
            incoming[nid], outgoing[nid] = [], []
            kind = node.get("type")
            if loop and kind in ("start", "end", "loop"):
                add("LOOP_BODY_INVALID", "type", nid)
            elif kind not in (BODY_TYPES if loop else TOP_TYPES):
                add("NODE_TYPE_INVALID", "type", nid)
            pos = node.get("position")
            if not isinstance(pos, dict) or any(
                not matches(pos.get(k), "number") for k in ("x", "y")
            ):
                add("NODE_POSITION_INVALID", "position", nid)
            if not isinstance(node.get("data"), dict):
                add("NODE_DATA_INVALID", "data", nid)
            elif kind == "loop" and not loop:
                bodies.append(node)
        if loop is None:
            for kind in ("start", "end"):
                if sum(by_id[n].get("type") == kind for n in graph["ids"]) != 1:
                    add(f"{kind.upper()}_COUNT_INVALID", "nodes")
        pairs = set()
        for edge in edges:
            if not isinstance(edge, dict):
                add("EDGE_ID_INVALID", "id")
                continue
            eid, source, target = edge.get("id"), edge.get("source"), edge.get("target")
            if not isinstance(eid, str) or not eid:
                add("EDGE_ID_INVALID", "id")
                continue
            if eid in edge_ids:
                add("EDGE_ID_DUPLICATE", "id", edge=eid)
            edge_ids.add(eid)
            if (
                not isinstance(source, str)
                or not isinstance(target, str)
                or source not in incoming
                or target not in incoming
            ):
                add("EDGE_NODE_NOT_FOUND", "source/target", edge=eid)
                continue
            if source == target:
                add("EDGE_SELF_LOOP", "target", edge=eid)
            # 只有 condition 的出边按出口区分，其他节点的 sourceHandle 是 UI 字段。
            handle = (
                edge.get("sourceHandle")
                if by_id[source].get("type") == "condition"
                else None
            )
            key = (source, handle if isinstance(handle, str) else None, target)
            if key in pairs:
                add("EDGE_DUPLICATE", "source/target", edge=eid)
            pairs.add(key)
            incoming[target].append(source)
            outgoing[source].append((target, handle, eid))
        # Kahn traversal also detects cycles in disconnected components.
        degree = {n: len(v) for n, v in incoming.items()}
        queue = [n for n, d in degree.items() if d == 0]
        order = []
        while queue:
            nid = queue.pop(0)
            order.append(nid)
            for target, _, _ in outgoing[nid]:
                degree[target] -= 1
                if degree[target] == 0:
                    queue.append(target)
        if len(order) != len(incoming):
            add("GRAPH_CYCLE", "graph", loop)
        if loop is None:
            entries = [n for n in graph["ids"] if by_id[n].get("type") == "start"]
        else:
            entries = [n for n in graph["ids"] if not incoming[n]]
            if len(entries) != 1:
                add("LOOP_BODY_INVALID", "data.body", loop)
        reachable, pending = set(), entries[:]
        while pending:
            nid = pending.pop()
            if nid not in reachable:
                reachable.add(nid)
                pending.extend(target for target, _, _ in outgoing[nid])
        for nid in graph["ids"]:
            node, outs = by_id[nid], outgoing[nid]
            kind = node.get("type")
            if nid not in reachable:
                add("ISOLATED_NODE", "graph", nid)
            if kind == "start" and incoming[nid]:
                add("START_HAS_INBOUND", "edges", nid)
            if kind == "end":
                if outs:
                    add("END_HAS_OUTBOUND", "edges", nid)
            elif kind == "condition":
                exits = ports(node)
                names = [port for _, port in exits]
                for _, handle, eid in outs:
                    if handle not in names:
                        add("EDGE_HANDLE_INVALID", "sourceHandle", nid, eid)
                for field, port in exits:
                    count = sum(handle == port for _, handle, _ in outs)
                    if count > 1:
                        add("NODE_OUTBOUND_INVALID", field, nid)
                    elif not count and loop is None:
                        add("CONDITION_PORT_UNCONNECTED", field, nid)
            elif len(outs) > 1:
                add("NODE_OUTBOUND_INVALID", "edges", nid)
            elif not outs and loop is None:
                add("NODE_OUTBOUND_REQUIRED", "edges", nid)
        for node in bodies:
            body = node["data"].get("body")
            if (
                not isinstance(body, dict)
                or not isinstance(body.get("nodes"), list)
                or not isinstance(body.get("edges"), list)
                or not body["nodes"]
            ):
                add("LOOP_BODY_INVALID", "data.body", node["id"])
                continue
            body_of[node["id"]] = check_graph(body["nodes"], body["edges"], node["id"])
        return graph

    check_graph(nodes, edges, None)
    if len(by_id) > MAX_NODES:
        add("WORKFLOW_TOO_LARGE", "nodes")
    # 第三阶段：检查各类节点参数，并记录可被引用的输出字段。
    fields = {}
    for nid, node in by_id.items():
        kind = node.get("type")
        data = node.get("data")
        if not isinstance(data, dict):
            continue
        if kind in ("start", "end"):
            key, prefix = (
                ("inputs", "INPUT") if kind == "start" else ("outputs", "OUTPUT")
            )
            entries = data.get(key)
            fields[nid] = {}
            if not isinstance(entries, list) or not entries:
                add(
                    (
                        "START_INPUT_REQUIRED"
                        if kind == "start"
                        else "END_OUTPUT_REQUIRED"
                    ),
                    f"data.{key}",
                    nid,
                )
                continue
            for i, entry in enumerate(entries):
                path = f"data.{key}[{i}]"
                if not isinstance(entry, dict):
                    add(f"{prefix}_NAME_INVALID", path, nid)
                    continue
                name = entry.get("name")
                if not isinstance(name, str) or not NAME.fullmatch(name):
                    add(f"{prefix}_NAME_INVALID", path + ".name", nid)
                    continue
                if name in fields[nid]:
                    add(f"{prefix}_NAME_DUPLICATE", path + ".name", nid)
                fields[nid][name] = (
                    entry["type"] if is_type(entry.get("type")) else "invalid"
                )
                if not is_type(entry.get("type")):
                    add("FIELD_TYPE_INVALID", path + ".type", nid)
                if kind == "start" and not isinstance(entry.get("required"), bool):
                    add("INPUT_REQUIRED_INVALID", path + ".required", nid)
        elif kind == "llm":
            fields[nid] = {"text": "string"}
            if not isinstance(data.get("model"), str) or not data["model"].strip():
                add("LLM_MODEL_REQUIRED", "data.model", nid)
            if (
                not isinstance(data.get("userPromptTemplate"), str)
                or not data["userPromptTemplate"].strip()
            ):
                add("LLM_PROMPT_REQUIRED", "data.userPromptTemplate", nid)
            temp, tokens = data.get("temperature", 0.7), data.get("maxTokens", 2048)
            if not matches(temp, "number") or not 0 <= temp <= 2:
                add("LLM_PARAM_OUT_OF_RANGE", "data.temperature", nid)
            if type(tokens) is not int or not 1 <= tokens <= 8192:
                add("LLM_PARAM_OUT_OF_RANGE", "data.maxTokens", nid)
            if "outputs" in data and data["outputs"] != [
                {"name": "text", "type": "string"}
            ]:
                add("LLM_OUTPUT_INVALID", "data.outputs", nid)
        elif kind == "condition":
            fields[nid] = {"branch": "string"}
            branches, seen = data.get("branches"), set()
            if not isinstance(branches, list) or not 1 <= len(branches) <= MAX_BRANCHES:
                add("CONDITION_BRANCH_REQUIRED", "data.branches", nid)
                continue
            for i, branch in enumerate(branches):
                path = f"data.branches[{i}]"
                if not isinstance(branch, dict):
                    add("CONDITION_BRANCH_ID_INVALID", path, nid)
                    continue
                bid = branch.get("id")
                if not isinstance(bid, str) or not NAME.fullmatch(bid) or bid == "else":
                    add("CONDITION_BRANCH_ID_INVALID", path + ".id", nid)
                elif bid in seen:
                    add("CONDITION_BRANCH_ID_DUPLICATE", path + ".id", nid)
                seen.add(bid if isinstance(bid, str) else None)
                if branch.get("logic", "and") not in ("and", "or"):
                    add("CONDITION_OPERATOR_INVALID", path + ".logic", nid)
                conditions = branch.get("conditions")
                if (
                    not isinstance(conditions, list)
                    or not 1 <= len(conditions) <= MAX_CONDITIONS
                    or not all(isinstance(c, dict) for c in conditions)
                ):
                    add("CONDITION_BRANCH_REQUIRED", path + ".conditions", nid)
        elif kind == "loop":
            fields[nid] = {"count": "number"}
            mode, count = data.get("mode"), data.get("count")
            if mode not in ("array", "count"):
                add("LOOP_MODE_INVALID", "data.mode", nid)
            elif mode == "count" and (
                type(count) is not int or not 1 <= count <= MAX_LOOP
            ):
                add("LOOP_COUNT_OUT_OF_RANGE", "data.count", nid)
            outputs = data.get("outputs", [])
            if not isinstance(outputs, list):
                add("LOOP_OUTPUT_INVALID", "data.outputs", nid)
                continue
            for i, entry in enumerate(outputs):
                path = f"data.outputs[{i}]"
                name = entry.get("name") if isinstance(entry, dict) else None
                if (
                    not isinstance(name, str)
                    or not NAME.fullmatch(name)
                    or name in fields[nid]
                    or not isinstance(entry.get("type"), str)
                    or entry["type"] not in ARRAYS
                ):
                    add("LOOP_OUTPUT_INVALID", path, nid)
                    continue
                fields[nid][name] = entry["type"]
    # 第四阶段：检查引用语法、可见范围和字段类型。
    def visible(nid):
        """节点可引用的 {来源节点: {字段: 类型}}：所在图的祖先，循环体内再加循环变量和循环的可见范围。"""
        graph = graph_of[nid]
        seen, stack = set(), graph["incoming"][nid][:]
        while stack:
            item = stack.pop()
            if item not in seen:
                seen.add(item)
                stack.extend(graph["incoming"][item])
        scope = {
            a: fields.get(a, {})
            for a in seen
            if a != nid and by_id[a].get("type") != "end"
        }
        loop = graph["loop"]
        if loop:
            outer = visible(loop)
            scope[loop] = {"index": "number"}
            item = item_type(loop, outer)
            if item:
                scope[loop]["item"] = item
            for source, entry in outer.items():
                scope.setdefault(source, entry)
        return scope

    def item_type(loop, scope):
        """array 模式下循环元素类型；items 非法或为 count 模式时为 None。"""
        data = by_id[loop]["data"]
        items = data.get("items")
        match = REF.fullmatch(items) if isinstance(items, str) else None
        if data.get("mode") != "array" or not match:
            return None
        return ARRAYS.get(scope.get(match.group(1), {}).get(match.group(2)))

    def reference(value, nid, path, expected=None, scope=None):
        """检查单个 nodeId.field 引用，返回被引用字段类型；非法时返回 None。"""
        match = REF.fullmatch(value) if isinstance(value, str) else None
        kind = None
        if match:
            source, field = match.groups()
            kind = (visible(nid) if scope is None else scope).get(source, {}).get(field)
        if kind is None:
            add("INVALID_REFERENCE", path, nid)
        elif expected and kind != expected:
            add("OUTPUT_TYPE_MISMATCH", path, nid)
        return kind

    def candidates(value, nid, path, expected=None, scope=None):
        """valueFrom 可以是单个引用或非空候选列表。"""
        if isinstance(value, list) and value:
            for j, item in enumerate(value):
                reference(item, nid, f"{path}[{j}]", expected, scope)
        else:
            reference(value, nid, path, expected, scope)

    def check_condition(cond, nid, path):
        """左值决定可用算子和右值类型；右值是字面量或引用。"""
        left = reference(cond.get("left"), nid, path + ".left")
        op = cond.get("op")
        if left is None:
            return
        if not isinstance(op, str) or op not in operators(left):
            add("CONDITION_OPERATOR_INVALID", path + ".op", nid)
            return
        if op in UNARY:
            return
        right, expected = cond.get("right"), right_type(left)
        kind = right.get("type") if isinstance(right, dict) else None
        if kind == "literal":
            if not matches(right.get("value"), expected):
                add("CONDITION_VALUE_TYPE_MISMATCH", path + ".right", nid)
        elif kind == "ref":
            actual = reference(right.get("value"), nid, path + ".right.value")
            if actual is not None and actual != expected:
                add("CONDITION_VALUE_TYPE_MISMATCH", path + ".right", nid)
        else:
            add("CONDITION_VALUE_TYPE_MISMATCH", path + ".right", nid)

    for nid, node in by_id.items():
        data, kind = node.get("data"), node.get("type")
        if not isinstance(data, dict):
            continue
        if kind == "llm":
            for key in ("userPromptTemplate", "systemPrompt"):
                value = data.get(key, "")
                if not isinstance(value, str):
                    add("INVALID_REFERENCE", f"data.{key}", nid)
                    continue
                for match in TEMPLATE.finditer(value):
                    reference(match.group(1), nid, f"data.{key}")
                remaining = TEMPLATE.sub("", value)
                if "{{" in remaining or "}}" in remaining:
                    add("INVALID_REFERENCE", f"data.{key}", nid)
        elif kind == "end" and isinstance(data.get("outputs"), list):
            for i, entry in enumerate(data["outputs"]):
                if isinstance(entry, dict):
                    candidates(
                        entry.get("valueFrom"),
                        nid,
                        f"data.outputs[{i}].valueFrom",
                        entry.get("type"),
                    )
        elif kind == "condition" and isinstance(data.get("branches"), list):
            for i, branch in enumerate(data["branches"]):
                conditions = branch.get("conditions") if isinstance(branch, dict) else None
                for j, cond in enumerate(conditions if isinstance(conditions, list) else []):
                    if isinstance(cond, dict):
                        check_condition(cond, nid, f"data.branches[{i}].conditions[{j}]")
        elif kind == "loop":
            if data.get("mode") == "array" and not item_type(nid, visible(nid)):
                add("LOOP_ITEMS_INVALID", "data.items", nid)
            body = body_of.get(nid)
            outputs = data.get("outputs")
            if body is None or not isinstance(outputs, list):
                continue
            scope = {b: fields.get(b, {}) for b in body["ids"]}
            for i, entry in enumerate(outputs):
                if isinstance(entry, dict) and isinstance(entry.get("type"), str) and entry["type"] in ARRAYS:
                    candidates(
                        entry.get("valueFrom"),
                        nid,
                        f"data.outputs[{i}].valueFrom",
                        ARRAYS[entry["type"]],
                        scope,
                    )
    return dict(valid=not errors, errors=errors)


def validate_input(definition, values):
    """对已通过完整校验的定义检查 Start 必填输入及其数据类型。"""
    errors = []
    start = next(n for n in definition["nodes"] if n["type"] == "start")
    for entry in start["data"]["inputs"]:
        name = entry["name"]
        if (name not in values and entry["required"]) or (
            name in values and not matches(values[name], entry["type"])
        ):
            errors.append(
                dict(
                    code="INVALID_INPUT",
                    message=f"输入缺失或类型错误: {name}",
                    nodeId=start["id"],
                    edgeId=None,
                    field=f"input.{name}",
                )
            )
    return errors
