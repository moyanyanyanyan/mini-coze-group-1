"""Workflow-owned boundary. Runtime owner supplies the callable via app.state.

Callable: async (*, model, system_prompt, user_prompt, temperature, max_tokens)
    -> {"text": str, "usage": optional dict}
No fallback to a mock or duplicate model client is allowed in production.
"""
import asyncio


class RuntimeAdapter:
    def __init__(self, complete=None):
        self.complete = complete

    async def invoke(self, **kwargs):
        if self.complete is None:
            raise RuntimeError('Runtime completion provider is not installed')
        result = await asyncio.wait_for(self.complete(**kwargs), timeout=60)
        if not isinstance(result, dict) or not isinstance(result.get('text'), str):
            raise RuntimeError('Invalid Runtime result')
        return {'text': result['text'], **({'usage': result['usage']} if isinstance(result.get('usage'), dict) else {})}
