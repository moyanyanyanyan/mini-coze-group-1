from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, strict=True)


Identifier = Annotated[str, Field(min_length=1, max_length=200)]


class ChatMessage(DTO):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=32000)


class ModelInput(DTO):
    model: str = Field(min_length=1, max_length=100)
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)
    temperature: float = Field(default=0.7, ge=0, le=2, allow_inf_nan=False)
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class Usage(DTO):
    promptTokens: int = Field(ge=0)
    completionTokens: int = Field(ge=0)
    totalTokens: int = Field(ge=0)


class ModelResult(DTO):
    content: str
    finishReason: Literal["stop", "length"]
    usage: Usage | None = None


class AgentConfig(DTO):
    id: Identifier
    revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=200)
    systemPrompt: str = Field(max_length=16000)
    model: str = Field(min_length=1, max_length=100)
    temperature: float = Field(ge=0, le=2, allow_inf_nan=False)
    maxTokens: int = Field(ge=1, le=8192)
    knowledgeBaseIds: list[Identifier] = Field(max_length=10)
    pluginIds: list[Identifier] = Field(max_length=20)


class Actor(DTO):
    id: Identifier


class HistoryMessage(DTO):
    id: Identifier
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class RuntimeRequest(DTO):
    runId: Identifier
    actor: Actor
    conversationId: Identifier
    userMessageId: Identifier
    assistantMessageId: Identifier
    agentConfig: AgentConfig
    history: list[HistoryMessage] = Field(max_length=20)
    message: str = Field(min_length=1, max_length=8000)

    @model_validator(mode="after")
    def validate_history(self) -> Self:
        if not self.message.strip():
            raise ValueError("消息不能为空")
        ids = [item.id for item in self.history]
        if self.userMessageId == self.assistantMessageId or len(set(ids)) != len(ids):
            raise ValueError("消息 ID 必须唯一")
        if {self.userMessageId, self.assistantMessageId}.intersection(ids):
            raise ValueError("history 不能包含本轮消息")
        if len(self.history) % 2 or any(
            item.role != ("user" if i % 2 == 0 else "assistant")
            for i, item in enumerate(self.history)
        ):
            raise ValueError("history 必须由按时间排列的完整问答对组成")
        return self


class Citation(DTO):
    knowledgeBaseId: Identifier
    documentId: Identifier
    chunkId: Identifier
    title: str
    position: dict[str, JsonValue] | None = None


class KnowledgeRequest(DTO):
    runId: Identifier
    actorId: Identifier
    agentId: Identifier
    knowledgeBaseIds: list[Identifier]
    query: str
    topK: Literal[5] = 5


class KnowledgeChunk(DTO):
    citation: Citation
    content: str = Field(min_length=1)
    score: float = Field(allow_inf_nan=False)


class KnowledgeResult(DTO):
    status: Literal["matched", "no_match"]
    chunks: list[KnowledgeChunk] = Field(max_length=50)

    @model_validator(mode="after")
    def consistent(self) -> Self:
        if (self.status == "matched") != bool(self.chunks):
            raise ValueError("检索状态与 chunks 不一致")
        return self


class ToolDefinition(DTO):
    pluginId: Identifier
    name: Identifier
    description: str
    parameters: dict[str, JsonValue]


class ToolRequest(DTO):
    runId: Identifier
    actorId: Identifier
    agentId: Identifier
    toolCallId: Identifier
    toolName: Identifier
    arguments: dict[str, JsonValue]


class ToolSuccess(DTO):
    toolCallId: Identifier
    toolName: Identifier
    status: Literal["succeeded"]
    output: JsonValue


class ToolFailure(DTO):
    toolCallId: Identifier
    toolName: Identifier
    status: Literal["failed"]
    error: dict[str, str]


class RuntimeResult(ModelResult):
    runId: str
    conversationId: str
    assistantMessageId: str
    status: Literal["completed"] = "completed"
    citations: list[Citation] = Field(default_factory=list)
    toolResults: list[ToolSuccess | ToolFailure] = Field(default_factory=list)
