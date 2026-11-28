import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.knowledge.vision import PROMPT, build_payload
from app.main import app

client = TestClient(app)


def _settings(available: bool = False):
    return SimpleNamespace(
        internal_service_token=SecretStr("test-token"),
        vision_available=available,
    )


def test_payload_embeds_image_data_url_and_prompt() -> None:
    payload = build_payload(b"image-bytes", "image/png", "vision-model")

    assert payload["model"] == "vision-model"
    assert payload["max_tokens"] == 512
    content = payload["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": PROMPT}
    url = content[1]["image_url"]["url"]
    assert url == "data:image/png;base64," + base64.b64encode(b"image-bytes").decode()


def test_vision_rejects_invalid_token() -> None:
    with patch("app.api.router.get_settings", return_value=_settings()):
        response = client.post(
            "/internal/knowledge/vision",
            content=b"image-bytes",
            headers={"Authorization": "Bearer wrong-token", "Content-Type": "image/png"},
        )
    assert response.status_code == 401


def test_vision_rejects_empty_body() -> None:
    with patch("app.api.router.get_settings", return_value=_settings()):
        response = client.post(
            "/internal/knowledge/vision",
            content=b"",
            headers={"Authorization": "Bearer test-token", "Content-Type": "image/png"},
        )
    assert response.status_code == 400


def test_vision_rejects_oversized_image() -> None:
    with patch("app.api.router.get_settings", return_value=_settings(available=True)):
        response = client.post(
            "/internal/knowledge/vision",
            content=b"x" * (5 * 1024 * 1024 + 1),
            headers={"Authorization": "Bearer test-token", "Content-Type": "image/png"},
        )
    assert response.status_code == 400


def test_vision_returns_503_when_not_configured() -> None:
    with patch("app.api.router.get_settings", return_value=_settings()):
        response = client.post(
            "/internal/knowledge/vision",
            content=b"image-bytes",
            headers={"Authorization": "Bearer test-token", "Content-Type": "image/png"},
        )
    assert response.status_code == 503


def test_vision_returns_description() -> None:
    with (
        patch("app.api.router.get_settings", return_value=_settings(available=True)),
        patch(
            "app.api.router.describe_image",
            new=AsyncMock(return_value="一只蓝色的鲸鱼，背景浅蓝，画面简洁。"),
        ) as mocked,
    ):
        response = client.post(
            "/internal/knowledge/vision",
            content=b"image-bytes",
            headers={"Authorization": "Bearer test-token", "Content-Type": "image/png"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "description": "一只蓝色的鲸鱼，背景浅蓝，画面简洁。",
        "chars": 18,
    }
    mocked.assert_awaited_once()
