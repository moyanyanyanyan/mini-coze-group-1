import asyncio
import threading
from types import SimpleNamespace

import httpx
import pytest

from app import readiness
from app.main import app
from app.api import runtime
from app.config import Settings


def test_warmup_lifecycle(monkeypatch):
    calls = []
    def embed(texts):
        calls.append(texts)
        return {"vectors": [[0.1] * 512]}
    monkeypatch.setattr(readiness, "embed_texts", embed)
    async def verify():
        instance = SimpleNamespace(state=SimpleNamespace())
        async with readiness.lifespan(instance):
            assert instance.state.readiness == "starting"
            for _ in range(100):
                if instance.state.readiness == "ready":
                    break
                await asyncio.sleep(0.01)
            assert instance.state.readiness == "ready"
        assert len(calls) == 1
    asyncio.run(verify())


@pytest.mark.parametrize("invalid", [False, True])
def test_warmup_failure(monkeypatch, invalid):
    def embed(texts):
        if invalid:
            return {"vectors": [[0.0] * 512]}
        raise RuntimeError("load failure")
    monkeypatch.setattr(readiness, "embed_texts", embed)
    instance = SimpleNamespace(state=SimpleNamespace(readiness="starting"))
    asyncio.run(readiness.warmup(instance))
    assert instance.state.readiness == "failed"


def test_timeout_cannot_become_ready_later(monkeypatch):
    release = threading.Event()
    finished = threading.Event()
    def embed(texts):
        release.wait(2)
        finished.set()
        return {"vectors": [[0.1] * 512]}
    monkeypatch.setattr(readiness, "embed_texts", embed)
    monkeypatch.setattr(readiness, "WARMUP_TIMEOUT", 0.02)
    async def verify():
        instance = SimpleNamespace(state=SimpleNamespace(readiness="starting"))
        try:
            await readiness.warmup(instance)
            assert instance.state.readiness == "failed"
        finally:
            release.set()
        await asyncio.to_thread(finished.wait, 2)
        assert instance.state.readiness == "failed"
    asyncio.run(verify())


@pytest.mark.parametrize("state,status", [("starting",503),("failed",503),("ready",200)])
def test_readiness_and_runtime_gate(monkeypatch, state, status):
    monkeypatch.setattr(app.state, "readiness", state, raising=False)
    monkeypatch.setattr(runtime, "get_settings", lambda: Settings(_env_file=None, INTERNAL_SERVICE_TOKEN="test"))
    async def verify():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
            response = await client.get("/ready")
            assert response.status_code == status
            assert response.json()["status"] == state
            assert (await client.get("/health")).status_code == 200
            if state != "ready":
                for path in ["run", "stream"]:
                    response = await client.post("/internal/runtime/" + path, headers={"Authorization": "Bearer test"}, json={})
                    assert response.status_code == 503
                    assert response.headers["X-Runtime-Error-Code"] == "SERVICE_NOT_READY"
    asyncio.run(verify())
