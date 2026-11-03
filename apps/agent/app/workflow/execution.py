"""按连线执行已经通过校验的工作流：单活动路径、条件分支、循环子图。"""

import asyncio
import json
import time

from ..config import get_settings
from .conditions import UNARY, compare
from .validation import TEMPLATE

MAX_STEPS = 200
PREVIEW_CHARS = 500


class ReferenceNotExecuted(Exception):
    """引用的节点在本次运行中没有执行（位于未走到的分支）。"""


class StepLimitExceeded(Exception):
    """节点执行次数超过单次运行上限。"""


class Stop(Exception):
    """节点失败后终止执行；node_id 为当前图中失败的节点。"""

    def __init__(self, node_id):
        super().__init__(node_id)
        self.node_id = node_id


def resolve(ref, outputs):
    """读取 nodeId.field 的原始值；节点已执行但字段缺失（未提供的可选输入）时为 None。"""
    node, field = ref.split(".")
    if node not in outputs:
        raise ReferenceNotExecuted(ref)
    return outputs[node].get(field)


def preview(value):
    """运行记录里展示的值：过长字符串截断，避免 nodeResults 体积失控。"""
    if isinstance(value, str) and len(value) > PREVIEW_CHARS:
        return value[:PREVIEW_CHARS] + "…"
    if isinstance(value, list):
        return [preview(item) for item in value]
    return value


def pick(value_from, outputs):
    """valueFrom 为单个引用或候选列表，取第一个已执行节点的值。"""
    refs = value_from if isinstance(value_from, list) else [value_from]
    for ref in refs:
        if ref.split(".")[0] in outputs:
            return resolve(ref, outputs)
    raise ReferenceNotExecuted(refs[0])


def render(template, outputs):
    """替换提示词变量；缺失值为空串，数字、布尔值和数组按 JSON 文本插入。"""

    def replace(match):
        value = resolve(match.group(1), outputs)
        if value is None:
            return ""
        return (
            value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        )

    return TEMPLATE.sub(replace, template)


def evaluate(data, outputs):
    """按分支顺序求值，返回命中分支 id（都不命中为 else）和参与比较的实际值。"""
    checked = []
    for branch in data["branches"]:
        results = []
        for cond in branch["conditions"]:
            left, op = resolve(cond["left"], outputs), cond["op"]
            right = None
            if op not in UNARY:
                operand = cond["right"]
                right = (
                    resolve(operand["value"], outputs)
                    if operand["type"] == "ref"
                    else operand["value"]
                )
            result = compare(left, op, right)
            checked.append(
                dict(
                    branch=branch["id"],
                    left=preview(left),
                    op=op,
                    right=preview(right),
                    result=result,
                )
            )
            results.append(result)
        if (any if branch.get("logic") == "or" else all)(results):
            return branch["id"], checked
    return "else", checked


class StartExecutor:
    """提取 Start 声明且实际提供的输入，保留原始数据类型。"""

    async def execute(self, data, values, outputs, runtime):
        return {
            entry["name"]: values[entry["name"]]
            for entry in data["inputs"]
            if entry["name"] in values
        }


class LlmExecutor:
    """替换提示词变量，通过统一 Runtime 适配器调用模型。"""

    async def execute(self, data, values, outputs, runtime):
        return await runtime.invoke(
            model=data["model"],
            system_prompt=render(data.get("systemPrompt", ""), outputs),
            user_prompt=render(data["userPromptTemplate"], outputs),
            temperature=data.get("temperature", 0.7),
            max_tokens=data.get("maxTokens", 2048),
        )


class EndExecutor:
    """根据 valueFrom 将上游输出映射为最终输出字段。"""

    async def execute(self, data, values, outputs, runtime):
        return {
            entry["name"]: pick(entry["valueFrom"], outputs)
            for entry in data["outputs"]
        }


EXECUTORS = {"start": StartExecutor(), "llm": LlmExecutor(), "end": EndExecutor()}
ERRORS = {
    "LLM_TIMEOUT": "模型调用超时",
    "REFERENCE_NOT_EXECUTED": "引用的节点未执行",
    "WORKFLOW_STEP_LIMIT_EXCEEDED": "超过单次运行节点执行上限",
    "WORKFLOW_TIMEOUT": "工作流运行超时",
}


class Run:
    """一次运行的共享状态：输入、Runtime、节点记录、步数和截止时间。"""

    def __init__(self, values, runtime, timeout):
        self.values, self.runtime = values, runtime
        self.deadline = time.monotonic() + timeout
        self.steps, self.results = 0, []


async def run_graph(nodes, edges, entry, run, outputs, parent=None, iteration=None):
    """从 entry 出发沿唯一活动路径执行，走到没有后继的节点为止。

    condition 按命中分支的 sourceHandle 选边，其他节点只有一条出边。
    outputs 按节点 ID 保存原始输出，供后续模板替换与 valueFrom 映射使用。
    """
    by_id = {n["id"]: n for n in nodes}
    following = {}
    for edge in edges:
        is_condition = by_id[edge["source"]]["type"] == "condition"
        handle = edge.get("sourceHandle") if is_condition else None
        following[(edge["source"], handle)] = edge["target"]
    nid, previous = entry, outputs.get(parent)
    while nid:
        node = by_id[nid]
        previous = outputs[nid] = await run_node(
            node, run, outputs, previous, parent, iteration
        )
        handle = previous["branch"] if node["type"] == "condition" else None
        nid = following.get((nid, handle))


async def run_loop(node, run, outputs, items):
    """串行执行每一轮循环体；每轮复制外层输出，body 输出不泄漏到循环外。"""
    nid, data = node["id"], node["data"]
    body = data["body"]
    targets = {edge["target"] for edge in body["edges"]}
    entry = next(n["id"] for n in body["nodes"] if n["id"] not in targets)
    declared = data.get("outputs", [])
    collected = {output["name"]: [] for output in declared}
    for index, item in enumerate(items):
        scope = dict(outputs)
        scope[nid] = {"index": index}
        if data["mode"] == "array":
            scope[nid]["item"] = item
        await run_graph(body["nodes"], body["edges"], entry, run, scope, nid, index)
        for output in declared:
            try:
                value = pick(output["valueFrom"], scope)
            except ReferenceNotExecuted:
                value = None
            collected[output["name"]].append(value)
    return {**collected, "count": len(items)}


async def run_node(node, run, outputs, previous, parent, iteration):
    """执行单个节点并写入记录；失败时记录 FAILED 并抛出 Stop 终止执行。"""
    nid, kind, data = node["id"], node["type"], node["data"]
    record = dict(
        nodeId=nid, type=kind, status="FAILED", input={}, output=None, error=None
    )
    if parent:
        record.update(parentId=parent, iteration=iteration)
    started = time.monotonic()
    try:
        run.steps += 1
        if run.steps > MAX_STEPS:
            raise StepLimitExceeded()
        if started >= run.deadline:
            raise TimeoutError()
        if kind == "start":
            record["input"] = run.values
        elif kind == "end":
            record["input"] = {
                entry["name"]: pick(entry["valueFrom"], outputs)
                for entry in data["outputs"]
            }
        elif kind == "llm":
            record["input"] = dict(previous or {})
        if kind == "condition":
            branch, checked = evaluate(data, outputs)
            record["input"], output = {"conditions": checked}, {"branch": branch}
        elif kind == "loop":
            if data["mode"] == "array":
                items = resolve(data["items"], outputs) or []
                record["input"] = {"items": preview(items)}
            else:
                items = [None] * data["count"]
                record["input"] = {"count": data["count"]}
            output = await run_loop(node, run, outputs, items)
        else:
            output = await asyncio.wait_for(
                EXECUTORS[kind].execute(data, run.values, outputs, run.runtime),
                run.deadline - started,
            )
    except Stop:
        # 循环体内节点已记录自身错误，循环节点只标记为失败。
        record["error"] = dict(code="NODE_EXECUTION_FAILED", message="循环体执行失败")
    except Exception as exc:
        if isinstance(exc, ReferenceNotExecuted):
            code = "REFERENCE_NOT_EXECUTED"
        elif isinstance(exc, StepLimitExceeded):
            code = "WORKFLOW_STEP_LIMIT_EXCEEDED"
        elif isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
            code = (
                "WORKFLOW_TIMEOUT" if time.monotonic() >= run.deadline else "LLM_TIMEOUT"
            )
        elif kind == "llm":
            code = "LLM_UNAVAILABLE"
        else:
            code = "NODE_EXECUTION_FAILED"
        # Never expose provider exception text (it may contain credentials).
        record["error"] = dict(code=code, message=ERRORS.get(code, "节点执行失败"))
    else:
        record.update(status="SUCCEEDED", output=output)
    record["durationMs"] = int((time.monotonic() - started) * 1000)
    run.results.append(record)
    if record["error"]:
        raise Stop(nid)
    return output


async def execute(definition, values, runtime, timeout=None):
    """返回整体结果和节点记录；未执行的顶层节点追加为 SKIPPED。

    definition 必须已通过完整图校验，values 必须已通过 Start 输入校验。
    """
    run = Run(values, runtime, timeout or get_settings().workflow_run_timeout)
    nodes, outputs, failure = definition["nodes"], {}, None
    start = next(n for n in nodes if n["type"] == "start")
    try:
        await run_graph(nodes, definition["edges"], start["id"], run, outputs)
    except Stop as stop:
        failure = dict(
            code="NODE_EXECUTION_FAILED", message="节点执行失败", nodeId=stop.node_id
        )
    for node in nodes:
        if node["id"] not in outputs and not any(
            r["nodeId"] == node["id"] for r in run.results
        ):
            run.results.append(
                dict(
                    nodeId=node["id"],
                    type=node["type"],
                    status="SKIPPED",
                    input={},
                    output=None,
                    error=None,
                    durationMs=0,
                )
            )
    end = next(n for n in nodes if n["type"] == "end")
    return dict(
        status="FAILED" if failure else "SUCCEEDED",
        output=None if failure else outputs[end["id"]],
        nodeResults=run.results,
        error=failure,
    )
