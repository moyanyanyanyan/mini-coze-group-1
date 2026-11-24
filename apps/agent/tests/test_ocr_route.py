import base64
from unittest.mock import patch

from fastapi.testclient import TestClient

import app.api.router as router_module
from app.config import Settings
from app.main import app

TOKEN = "test-token"


def settings_with_token(token: str) -> Settings:
    return Settings(_env_file=None, INTERNAL_SERVICE_TOKEN=token)


def payload(data: bytes = b"fake-image", mime_type: str = "image/png") -> dict:
    return {"imageBase64": base64.b64encode(data).decode(), "mimeType": mime_type}


def test_rejects_missing_credential(monkeypatch) -> None:
    monkeypatch.setattr(router_module, "get_settings", lambda: settings_with_token(TOKEN))
    response = TestClient(app).post("/internal/knowledge/ocr", json=payload())
    assert response.status_code == 401


def test_reports_unconfigured_token(monkeypatch) -> None:
    monkeypatch.setattr(router_module, "get_settings", lambda: settings_with_token(""))
    response = TestClient(app).post(
        "/internal/knowledge/ocr", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"}
    )
    assert response.status_code == 503


def test_rejects_invalid_base64(monkeypatch) -> None:
    monkeypatch.setattr(router_module, "get_settings", lambda: settings_with_token(TOKEN))
    response = TestClient(app).post(
        "/internal/knowledge/ocr",
        json={"imageBase64": "not base64!!", "mimeType": "image/png"},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 400


def test_rejects_unsupported_mime_type(monkeypatch) -> None:
    monkeypatch.setattr(router_module, "get_settings", lambda: settings_with_token(TOKEN))
    response = TestClient(app).post(
        "/internal/knowledge/ocr",
        json=payload(mime_type="image/gif"),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 400


def test_returns_recognized_text(monkeypatch) -> None:
    monkeypatch.setattr(router_module, "get_settings", lambda: settings_with_token(TOKEN))
    with patch.object(router_module, "recognize_image", return_value="报销制度\n交通费上限 300 元"):
        response = TestClient(app).post(
            "/internal/knowledge/ocr", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"}
        )
    assert response.status_code == 200
    assert response.json() == {"text": "报销制度\n交通费上限 300 元"}


def test_reports_unavailable_engine(monkeypatch) -> None:
    monkeypatch.setattr(router_module, "get_settings", lambda: settings_with_token(TOKEN))

    def boom(_: bytes) -> str:
        raise RuntimeError("engine missing")

    with patch.object(router_module, "recognize_image", side_effect=boom):
        response = TestClient(app).post(
            "/internal/knowledge/ocr", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"}
        )
    assert response.status_code == 503
