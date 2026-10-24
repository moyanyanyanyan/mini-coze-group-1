"""Workflow-owned boundary. Runtime owner supplies the callable via app.state.

Callable: async (*, model, system_prompt, user_prompt, temperature, max_tokens)
    -> {"text": str, "usage": optional dict, "finishReason": optional str}
No fallback to a mock or duplicate model client is allowed in production.
"""

import asyncio

from app.runtime import ModelError, call_model

# Slightly above MODEL_TIMEOUT_SECONDS so Runtime reports its own timeout first.
TIMEOUT_SECONDS = 65


async def runtime_complete(*, model, system_prompt, user_prompt, temperature, max_tokens):
    """把节点参数转换为 Runtime call_model 调用；Runtime 超时转为 TimeoutError。"""
    messages = [{"role": "user", "content": user_prompt}]
    if system_prompt:
        messages.insert(0, {"role": "system", "content": system_prompt})
    try:
        result = await call_model(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except ModelError as exc:
        if exc.code == "MODEL_TIMEOUT":
            raise TimeoutError from exc
        raise
    return {
        "text": result.content,
        "finishReason": result.finishReason,
        "usage": result.usage.model_dump() if result.usage else None,
    }


class RuntimeAdapter:
    def __init__(self, complete=None):
        self.complete = complete

    async def invoke(self, **kwargs):
        if self.complete is None:
            raise RuntimeError("Runtime completion provider is not installed")
        result = await asyncio.wait_for(
            self.complete(**kwargs), timeout=TIMEOUT_SECONDS
        )
        if not isinstance(result, dict) or not isinstance(result.get("text"), str):
            raise RuntimeError("Invalid Runtime result")
        return {
            "text": result["text"],
            **(
                {"finishReason": result["finishReason"]}
                if isinstance(result.get("finishReason"), str)
                else {}
            ),
            **(
                {"usage": result["usage"]}
                if isinstance(result.get("usage"), dict)
                else {}
            ),
        }
