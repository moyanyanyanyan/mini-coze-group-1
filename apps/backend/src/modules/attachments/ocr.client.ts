import { Injectable } from '@nestjs/common';
import { AttachmentError } from './attachment.types';

/**
 * 调用 Agent 的 OCR 端点。
 * Agent 未配置/不可达/模型未安装都归为 OCR_UNAVAILABLE，
 * 这样上传接口仍然返回 202 + FAILED，前端能看到明确原因而不是 500。
 */
@Injectable()
export class OcrClient {
  async recognize(bytes: Uint8Array, mimeType: string): Promise<string> {
    const serviceUrl = process.env.AGENT_SERVICE_URL;
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (!serviceUrl || !token) {
      throw new AttachmentError('OCR_UNAVAILABLE', 'OCR 服务未配置');
    }

    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    let response: Response;
    try {
      response = await fetch(new URL('/internal/knowledge/ocr', serviceUrl), {
        method: 'POST',
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
          Authorization: `Bearer ${token}`,
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AttachmentError('OCR_UNAVAILABLE', 'OCR 服务不可用');
    }

    if (!response.ok) {
      throw new AttachmentError('OCR_UNAVAILABLE', 'OCR 服务不可用');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AttachmentError('OCR_UNAVAILABLE', 'OCR 服务返回格式无效');
    }
    const text = (payload as { text?: unknown } | null)?.text;
    if (typeof text !== 'string') {
      throw new AttachmentError('OCR_UNAVAILABLE', 'OCR 服务返回格式无效');
    }
    return text;
  }
}
