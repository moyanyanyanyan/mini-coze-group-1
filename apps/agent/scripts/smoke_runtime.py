"""显式传 --live 才会调用付费模型；只输出验收统计，不输出凭据或完整回答。"""

import argparse
import asyncio
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.config import get_settings
from app.runtime import call_model


async def verify(port: int, token: str):
    settings = get_settings()
    body = {"runId": "smoke_" + secrets.token_hex(8), "actor": {"id": "smoke_user"},
            "conversationId": "smoke_conversation", "userMessageId": "smoke_user_message",
            "assistantMessageId": "smoke_assistant_message",
            "agentConfig": {"id": "smoke_agent", "revision": 0, "name": "验收助手", "systemPrompt": "简洁地回答。",
                            "model": settings.deepseek_model, "temperature": 0.7, "maxTokens": 128,
                            "knowledgeBaseIds": [], "pluginIds": []}, "history": [], "message": "用三句话介绍流式输出。"}
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=90) as client:
        for _ in range(100):
            try:
                if (await client.get("/health")).status_code == 200:
                    break
            except httpx.ConnectError:
                pass
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("本地服务未启动")
        headers = {"Authorization": "Bearer " + token}
        started = time.monotonic()
        first_delta = None
        events = []
        async with client.stream("POST", "/internal/runtime/stream", json=body, headers=headers) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data:"):
                    event = json.loads(line[5:])
                    events.append(event)
                    if event["type"] == "message.delta" and first_delta is None:
                        first_delta = time.monotonic() - started
        assert events[0]["type"] == "run.started"
        assert events[-1]["type"] == "run.completed", events[-1]
        assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
        deltas = [e["data"]["content"] for e in events if e["type"] == "message.delta"]
        assert len(deltas) > 1 and "".join(deltas) == events[-1]["data"]["content"]
        stream_seconds = time.monotonic() - started
        body["runId"] = "smoke_" + secrets.token_hex(8)
        body["message"] = "只回复你好。"
        response = await client.post("/internal/runtime/run", json=body, headers=headers)
        response.raise_for_status()
        assert response.json()["status"] == "completed"
        workflow = await call_model(model=settings.deepseek_model, messages=[{"role": "user", "content": "只回复好。"}], max_tokens=32)
        assert workflow.content and workflow.finishReason in ("stop", "length")
        print(json.dumps({"model": settings.deepseek_model, "http_stream": "passed", "http_run": "passed",
                          "workflow_call_model": "passed", "delta_count": len(deltas),
                          "first_delta_seconds": round(first_delta, 3), "stream_seconds": round(stream_seconds, 3),
                          "stream_usage": events[-1]["data"]["usage"]}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="明确允许三次真实模型调用")
    args = parser.parse_args()
    if not args.live:
        parser.error("真实模型验收需要显式 --live")
    if not get_settings().deepseek_api_key.get_secret_value().strip():
        parser.error("请先在本地 .env 配置 DEEPSEEK_API_KEY")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    token = secrets.token_urlsafe(32)
    env = dict(os.environ, INTERNAL_SERVICE_TOKEN=token)
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
                              env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    try:
        asyncio.run(verify(port, token))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == "__main__":
    main()
