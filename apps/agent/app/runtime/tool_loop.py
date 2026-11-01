"""受控工具循环；工具来源仅限本轮绑定快照，不重试有副作用的执行。"""
import json
from contextlib import aclosing

from app.runtime.deepseek import stream_model
from app.runtime.errors import ModelError
from app.runtime.schemas import ModelResult, ToolCallBatch, ToolRequest, ToolSuccess, ToolFailure, Usage

MAX_TOOL_ROUNDS = 4
MAX_TOOL_CALLS = 16


class ToolLoopResult(ModelResult):
    toolResults: list[ToolSuccess | ToolFailure]


def check_tool_budget(value, tools, messages, settings):
    # 工具定义、调用参数与结果都占用上下文；不截断协议消息或执行结果。
    size = len(json.dumps({"messages": messages, "tools": [t.model_dump() for t in tools]},
                          ensure_ascii=False).encode("utf-8"))
    if size + value.max_tokens > settings.context_token_limit:
        raise ModelError("INVALID_REQUEST", "工具上下文超过本服务预算", 400)


async def stream_tool_loop(value, tools, request, settings, plugins, client):
    messages = [message.model_dump() for message in value.messages]
    allowed = {tool.name: tool for tool in tools}
    seen = set()
    results = []
    content = []
    total = {"promptTokens": 0, "completionTokens": 0, "totalTokens": 0}
    has_usage = False
    for round_index in range(MAX_TOOL_ROUNDS + 1):
        check_tool_budget(value, tools, messages, settings)
        turn = None
        async with aclosing(stream_model(value, settings=settings, client=client,
                                        tools=tools, messages=messages)) as events:
            async for item in events:
                if isinstance(item, str):
                    content.append(item)
                    yield item
                else:
                    turn = item
        if turn is None:
            raise ModelError("MODEL_PROTOCOL_ERROR", "模型未返回回合终态", 502)
        if turn.usage is not None:
            has_usage = True
            for key, count in turn.usage.model_dump().items():
                total[key] += count
        if isinstance(turn, ModelResult):
            yield ToolLoopResult(content="".join(content), finishReason=turn.finishReason,
                                 usage=Usage(**total) if has_usage else None, toolResults=results)
            return
        if not isinstance(turn, ToolCallBatch):
            raise ModelError("MODEL_PROTOCOL_ERROR", "模型回合格式错误", 502)
        if round_index >= MAX_TOOL_ROUNDS or len(seen) + len(turn.calls) > MAX_TOOL_CALLS:
            raise ModelError("TOOL_LIMIT_EXCEEDED", "工具调用达到本轮上限", 502)
        # 整批检查后才执行，防止先执行第一项后才发现后续项越权或格式损坏。
        prepared = []
        for call in turn.calls:
            if call.name not in allowed:
                raise ModelError("TOOL_FORBIDDEN", "模型请求了本轮未授权工具", 502)
            if call.id in seen:
                raise ModelError("TOOL_PROTOCOL_ERROR", "工具调用ID重复", 502)
            try:
                args = json.loads(call.arguments)
                if not isinstance(args, dict):
                    raise ValueError("arguments must be object")
                # JSON中的NaN/Infinity不是合法工具参数，包括嵌套值。
                json.dumps(args, allow_nan=False)
            except (ValueError, TypeError) as exc:
                raise ModelError("TOOL_INVALID_ARGUMENTS", "工具参数不是合法JSON对象", 502) from exc
            prepared.append((call, args))
            seen.add(call.id)
        messages.append({"role": "assistant", "content": turn.content, "tool_calls": [
            {"id": call.id, "type": "function", "function": {"name": call.name, "arguments": call.arguments}}
            for call, _ in prepared
        ]})
        check_tool_budget(value, tools, messages, settings)
        for call, args in prepared:
            yield ("tool.started", {"toolCallId": call.id, "toolName": call.name})
            result = await plugins.execute(ToolRequest(runId=request.runId, actorId=request.actor.id,
                agentId=request.agentConfig.id, toolCallId=call.id, toolName=call.name, arguments=args))
            if result.toolCallId != call.id or result.toolName != call.name:
                raise ModelError("TOOL_PROTOCOL_ERROR", "工具返回调用标识不匹配", 502)
            raw = result.model_dump()
            encoded = json.dumps(raw, ensure_ascii=False, allow_nan=False)
            if len(encoded.encode("utf-8")) > 16000:
                raise ModelError("TOOL_RESULT_TOO_LARGE", "工具返回结果超过限制", 502)
            results.append(raw)
            yield ("tool.completed", raw)
            if result.status == "failed" and result.error.get("code") in ("INVALID_ARGUMENTS", "TOOL_NOT_FOUND"):
                raise ModelError("TOOL_EXECUTION_REJECTED", "工具拒绝了本轮调用", 502)
            messages.append({"role": "tool", "tool_call_id": call.id, "content": encoded})
    raise ModelError("TOOL_LIMIT_EXCEEDED", "工具调用达到本轮上限", 502)
