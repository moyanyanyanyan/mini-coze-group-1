import pytest
from pydantic import ValidationError

from app.config import Settings
from app.runtime.deepseek import estimate_input
from app.runtime.schemas import ChatMessage, ContextPreviewRequest
from app.runtime.service import RuntimeService


def preview(history, **kwargs):
    settings = Settings(_env_file=None, CONTEXT_TOKEN_LIMIT=1024)
    service = RuntimeService(settings)
    request = ContextPreviewRequest(systemPrompt="系统", maxTokens=128, history=history, **kwargs)
    return service, request, service.preview_context(request)


def pair(index, content):
    return [{"id": f"u{index}", "role": "user", "content": content},
            {"id": f"a{index}", "role": "assistant", "content": content}]


def test_budget_reserves_output_and_utf8_protocol_overhead():
    _, _, result = preview(pair(1, "中文🙂"))
    expected = estimate_input([ChatMessage(role="system", content="系统"),
                               ChatMessage(role="user", content="中文🙂"),
                               ChatMessage(role="assistant", content="中文🙂")]) + 16
    assert result["estimatedInputTokens"] == expected
    assert result["remainingTokens"] == 1024 - expected - 128
    assert result["droppedTurns"] == 0


def test_preview_and_execution_use_the_same_pair_trimming():
    history = pair(1, "旧" * 200) + pair(2, "保留")
    service, request, result = preview(history)
    assert [item["id"] for item in result["history"]] == ["u2", "a2"]
    assert result["droppedTurns"] == 1
    fitted = service.fit_context([ChatMessage(role="system", content="系统")],
        [ChatMessage(role=item.role, content=item.content) for item in request.history], [], 144)
    assert [m.content for m in fitted[1:]] == [item["content"] for item in result["history"]]


def test_empty_and_fully_evicted_memory_do_not_reappear():
    assert preview([])[2]["history"] == []
    result = preview(pair(1, "中" * 300))[2]
    assert result["history"] == []
    assert result["droppedTurns"] == 1
    with pytest.raises(ValidationError):
        preview([{"id": "u", "role": "user", "content": "落单"}])
