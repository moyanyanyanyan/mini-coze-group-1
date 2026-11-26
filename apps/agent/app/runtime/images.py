"""图片只从固定内部服务读取；预检不取图，实跑不去图降级。"""
import asyncio
import base64
import io
import warnings
from urllib.parse import quote

import httpx
from PIL import Image, UnidentifiedImageError

from app.runtime.errors import ModelError
from app.runtime.schemas import ChatMessage, ImagePart, ImageUrl, TextPart

MAX_IMAGES = 6
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000


def check_images(config, images, settings):
    if not images:
        return
    from app.runtime.deepseek import resolve_endpoint
    endpoint, _, provider = resolve_endpoint(settings, config.connection)
    # 只放行已实测的准确连接；OpenAI 兼容协议本身不是视觉能力证明。
    if (endpoint != 'https://api.siliconflow.cn/v1'
            or config.model != 'deepseek-ai/DeepSeek-V4.1-Flash'
            or provider not in ('siliconflow', 'openai_compatible')):
        raise ModelError('MODEL_VISION_UNSUPPORTED', '当前模型连接未验证图片及图片工具能力', 422)
    ids = [image.id for image in images]
    if len(ids) != len(set(ids)):
        raise ModelError('INVALID_REQUEST', '图片 ID 重复', 400)
    if len(images) > MAX_IMAGES:
        raise ModelError('IMAGE_CONTEXT_LIMIT', '本轮及历史图片总数超过限制', 422)
    for image in images:
        if hasattr(image, 'byteSize'):
            if image.byteSize > MAX_BYTES:
                raise ModelError('IMAGE_TOO_LARGE', '图片超过字节限制', 413)
            if image.width * image.height > MAX_PIXELS:
                raise ModelError('IMAGE_PIXEL_LIMIT', '图片超过像素限制', 422)


def image_refs(request):
    return [image for item in request.history for image in item.images] + request.images


def image_content(text, refs, urls):
    if not refs:
        return text
    parts = [TextPart(text=text)] if text.strip() else []
    return parts + [ImagePart(image_url=ImageUrl(url=urls[ref.id])) for ref in refs]


def budget_messages(messages):
    """仅移除传输编码用于文本预算；图片另受资源限制，不伪造视觉 token 估值。"""
    result = []
    has_images = False
    for message in messages:
        item = dict(message)
        if isinstance(item.get('content'), list):
            parts = []
            for part in item['content']:
                if part['type'] == 'image_url':
                    has_images = True
                else:
                    parts.append(part['text'])
            item['content'] = '\n'.join(parts)
        result.append(item)
    return result, has_images


def validate_bytes(raw, mime):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                actual = {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp'}.get(image.format)
                if actual != mime:
                    raise ModelError('IMAGE_UNSUPPORTED', '图片实际格式与声明不符', 415)
                if image.width * image.height > MAX_PIXELS:
                    raise ModelError('IMAGE_PIXEL_LIMIT', '图片超过像素限制', 422)
                if getattr(image, 'n_frames', 1) != 1:
                    raise ModelError('IMAGE_UNSUPPORTED', '首期仅支持静态图片', 415)
                image.verify()
            with Image.open(io.BytesIO(raw)) as decoded:
                decoded.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ModelError('IMAGE_PIXEL_LIMIT', '图片超过像素限制', 422) from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise ModelError('IMAGE_DECODE_FAILED', '图片无法解码', 415) from exc


async def fetch_images(request, settings, client=None):
    refs = image_refs(request)
    if not refs:
        return {}
    token = settings.internal_service_token.get_secret_value()
    if not token:
        raise ModelError('INTERNAL_NOT_CONFIGURED', '内部服务凭证未配置', 503)
    headers = {'Authorization': 'Bearer ' + token, 'X-Actor-Id': request.actor.id,
               'X-Conversation-Id': request.conversationId, 'X-Request-Id': request.runId}
    async def read_all(http):
        urls = {}
        for ref in refs:
            url = settings.effective_backend_service_url.rstrip('/') + '/internal/chat/images/' + quote(ref.id, safe='')
            try:
                async with asyncio.timeout(settings.image_fetch_timeout):
                    async with http.stream('GET', url, headers=headers, follow_redirects=False,
                                           timeout=settings.image_fetch_timeout) as response:
                        if response.status_code != 200:
                            raise ModelError('IMAGE_FETCH_FAILED', '图片读取失败', 502,
                                             response.status_code >= 500)
                        if response.headers.get('content-type', '').split(';')[0].strip().lower() != ref.mimeType:
                            raise ModelError('IMAGE_UNSUPPORTED', '图片响应格式不符', 415)
                        declared = response.headers.get('content-length')
                        if declared is not None:
                            try:
                                declared = int(declared)
                            except ValueError as exc:
                                raise ModelError('IMAGE_FETCH_FAILED', '图片长度响应无效', 502) from exc
                            if declared < 0:
                                raise ModelError('IMAGE_FETCH_FAILED', '图片长度响应无效', 502)
                            if declared > MAX_BYTES:
                                raise ModelError('IMAGE_TOO_LARGE', '图片超过字节限制', 413)
                        raw = bytearray()
                        async for chunk in response.aiter_bytes():
                            if len(raw) + len(chunk) > MAX_BYTES:
                                raise ModelError('IMAGE_TOO_LARGE', '图片超过字节限制', 413)
                            raw.extend(chunk)
                        if declared is not None and len(raw) != declared:
                            raise ModelError('IMAGE_FETCH_FAILED', '图片响应长度不符', 502)
                validate_bytes(raw, ref.mimeType)
                urls[ref.id] = 'data:' + ref.mimeType + ';base64,' + base64.b64encode(raw).decode('ascii')
            except (httpx.HTTPError, TimeoutError) as exc:
                raise ModelError('IMAGE_FETCH_FAILED', '图片读取失败或超时', 502, True) from exc
        return urls
    if client is not None:
        return await read_all(client)
    async with httpx.AsyncClient(follow_redirects=False) as owned:
        return await read_all(owned)
