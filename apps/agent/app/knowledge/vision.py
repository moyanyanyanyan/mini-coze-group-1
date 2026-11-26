"""图片语义理解：调用 OpenAI 兼容的多模态模型，输出一段简体中文描述。"""

import base64
from typing import Any

import httpx

from app.config import Settings

MAX_DESCRIPTION_CHARS = 600

PROMPT = (
    "请用简体中文描述这张图片，只输出纯文本，不要 Markdown 标题，不要 JSON。"
    "需要覆盖：主体及数量、颜色与外观、动作或姿态、场景或背景、图中可见文字。"
    "看不清或不确定的内容不要臆测；没有文字时写“无”。控制在 300 字以内。"
)


class VisionUnavailableError(RuntimeError):
    """视觉模型未配置、超时或返回异常；调用方应降级为仅 OCR。"""


def build_payload(data: bytes, mime_type: str, model: str) -> dict[str, Any]:
    encoded = base64.b64encode(data).decode("ascii")
    image_type = mime_type if mime_type.startswith("image/") else "image/png"
    return {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{image_type};base64,{encoded}"},
                    },
                ],
            }
        ],
        "max_tokens": 512,
        "temperature": 0.2,
    }


async def describe_image(data: bytes, mime_type: str, settings: Settings) -> str:
    if not settings.vision_available:
        raise VisionUnavailableError("视觉模型未配置")
    url = settings.vision_base_url.rstrip("/") + "/chat/completions"
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.vision_timeout_seconds),
            trust_env=settings.model_trust_env,
        ) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.vision_api_key.get_secret_value()}"
                },
                json=build_payload(data, mime_type, settings.vision_model),
            )
    except httpx.HTTPError as exc:
        raise VisionUnavailableError("视觉服务请求失败") from exc
    if response.status_code != 200:
        raise VisionUnavailableError(f"视觉服务返回 {response.status_code}")
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise VisionUnavailableError("视觉服务返回格式无效") from exc
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    if not isinstance(content, str) or not content.strip():
        raise VisionUnavailableError("视觉服务未返回描述")
    return content.strip()[:MAX_DESCRIPTION_CHARS]
