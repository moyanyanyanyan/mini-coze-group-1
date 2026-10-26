from typing import Protocol

from app.runtime.errors import ModelError
from app.runtime.schemas import KnowledgeRequest, KnowledgeResult, ToolDefinition, ToolRequest, ToolSuccess, ToolFailure
from app.runtime.http_providers import HttpKnowledgeProvider


class KnowledgeContextProvider(Protocol):
    async def get_context(self, request: KnowledgeRequest) -> KnowledgeResult: ...


class PluginToolProvider(Protocol):
    async def list_tools(self, actorId: str, agentId: str, pluginIds: list[str]) -> list[ToolDefinition]: ...

    async def execute(self, request: ToolRequest) -> ToolSuccess | ToolFailure: ...


class UnconfiguredKnowledgeProvider:
    async def get_context(self, request: KnowledgeRequest) -> KnowledgeResult:
        # 未接入的依赖不能伪装为真实检索未命中。
        raise ModelError("KNOWLEDGE_UNAVAILABLE", "知识库 Provider 尚未接入", 503)


class UnconfiguredPluginProvider:
    async def list_tools(self, actorId: str, agentId: str, pluginIds: list[str]) -> list[ToolDefinition]:
        raise ModelError("TOOL_UNAVAILABLE", "插件 Provider 尚未接入；本周不执行自动 Tool Call", 503)

    async def execute(self, request: ToolRequest) -> ToolSuccess | ToolFailure:
        raise ModelError("TOOL_UNAVAILABLE", "本周不执行自动 Tool Call", 503)
