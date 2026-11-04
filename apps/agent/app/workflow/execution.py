"""按 Start → LLM → End 顺序执行已经通过校验的工作流。"""

import asyncio
import json
import time

from .validation import TEMPLATE


def resolve(ref, outputs):
    """从节点输出上下文中读取 nodeId.field 对应的原始值。"""
    node, field = ref.split(".")
    return outputs[node][field]


def render(template, outputs):
    """替换提示词变量；数字和布尔值按 JSON 文本插入。"""

    def replace(match):
        value = resolve(match.group(1), outputs)
        return (
            value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        )

    return TEMPLATE.sub(replace, template)


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
            entry["name"]: resolve(entry["valueFrom"], outputs)
            for entry in data["outputs"]
        }


EXECUTORS = {"start": StartExecutor(), "llm": LlmExecutor(), "end": EndExecutor()}


async def execute(definition, values, runtime):
    """返回整体结果和节点记录；首个失败节点之后的节点标记为 SKIPPED。

    definition 必须已通过完整图校验，values 必须已通过 Start 输入校验。
    outputs 按节点 ID 保存原始输出，供后续模板替换与 End 映射使用。
    """
    by_id = {n["id"]: n for n in definition["nodes"]}
    next_node = {e["source"]: e["target"] for e in definition["edges"]}
    node = next(n for n in definition["nodes"] if n["type"] == "start")
    outputs, results = {}, []
    failure = None
    while node:
        nid, kind, data = node["id"], node["type"], node["data"]
        record = dict(
            nodeId=nid,
            type=kind,
            status="SKIPPED",
            input={},
            output=None,
            error=None,
            durationMs=0,
        )
        if failure is None:
            started = time.monotonic()
            try:
                if kind == "start":
                    record["input"] = values
                elif kind == "end":
                    record["input"] = {
                        entry["name"]: resolve(entry["valueFrom"], outputs)
                        for entry in data["outputs"]
                    }
                else:
                    upstream_id = next(
                        edge["source"]
                        for edge in definition["edges"]
                        if edge["target"] == nid
                    )
                    record["input"] = dict(outputs[upstream_id])
                output = await EXECUTORS[kind].execute(data, values, outputs, runtime)
                outputs[nid] = output
                record.update(status="SUCCEEDED", output=output)
            except Exception as exc:
                if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
                    code = "LLM_TIMEOUT"
                elif kind == "llm":
                    code = "LLM_UNAVAILABLE"
                else:
                    code = "NODE_EXECUTION_FAILED"
                # Never expose provider exception text (it may contain credentials).
                record.update(
                    status="FAILED",
                    error=dict(
                        code=code,
                        message=(
                            "模型调用超时" if code == "LLM_TIMEOUT" else "节点执行失败"
                        ),
                    ),
                )
                failure = dict(
                    code="NODE_EXECUTION_FAILED", message="节点执行失败", nodeId=nid
                )
            record["durationMs"] = int((time.monotonic() - started) * 1000)
        results.append(record)
        node = by_id.get(next_node.get(nid))
    return dict(
        status="FAILED" if failure else "SUCCEEDED",
        output=None if failure else results[-1]["output"],
        nodeResults=results,
        error=failure,
    )
