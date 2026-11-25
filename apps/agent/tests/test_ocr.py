from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.main import app

client = TestClient(app)


def _settings():
    return SimpleNamespace(internal_service_token=SecretStr("test-token"))


def test_ocr_rejects_invalid_token() -> None:
    with patch("app.api.router.get_settings", return_value=_settings()):
        response = client.post(
            "/internal/knowledge/ocr",
            content=b"image-bytes",
            headers={"Authorization": "Bearer wrong-token", "Content-Type": "image/png"},
        )
    assert response.status_code == 401


def test_ocr_rejects_empty_body() -> None:
    with patch("app.api.router.get_settings", return_value=_settings()):
        response = client.post(
            "/internal/knowledge/ocr",
            content=b"",
            headers={"Authorization": "Bearer test-token", "Content-Type": "image/png"},
        )
    assert response.status_code == 400
