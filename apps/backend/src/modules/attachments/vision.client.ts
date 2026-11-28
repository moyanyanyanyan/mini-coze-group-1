import { Injectable } from '@nestjs/common';
import { AttachmentError } from './attachment.types';

/**
 * 调用 Agent 的图片理解端点。
 * 未配置/超时/非 2xx 都归为 VISION_UNAVAILABLE，由解析器降级为仅 OCR。
 */
@Injectable()
export class VisionClient {
  async describe(bytes: Uint8Array, mimeType: string): Promise<string> {
    const serviceUrl = process.env.AGENT_SERVICE_URL;
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (!serviceUrl || !token) {
      throw new AttachmentError('VISION_UNAVAILABLE', '视觉服务未配置');
    }

    if (process.env.VISION_ENABLED !== 'true') {
      throw new AttachmentError('VISION_UNAVAILABLE', '视觉未启用');
    }

    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    let response: Response;
    try {
      response = await fetch(new URL('/internal/knowledge/vision', serviceUrl), {
        method: 'POST',
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
          Authorization: `Bearer ${token}`,
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AttachmentError('VISION_UNAVAILABLE', '视觉服务不可用');
    }

    if (!response.ok) {
      throw new AttachmentError('VISION_UNAVAILABLE', '视觉服务不可用');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AttachmentError('VISION_UNAVAILABLE', '视觉服务返回格式无效');
    }
    const description = (payload as { description?: unknown } | null)?.description;
    if (typeof description !== 'string') {
      throw new AttachmentError('VISION_UNAVAILABLE', '视觉服务返回格式无效');
    }
    return description;
  }
}
