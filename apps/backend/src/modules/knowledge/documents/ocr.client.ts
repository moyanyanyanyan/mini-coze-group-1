import { Injectable } from '@nestjs/common';
import { OcrUnavailableError } from './document-content';

// 调用 Python agent 服务的内部 OCR 接口，鉴权方式与 Embedding 一致。
@Injectable()
export class OcrClient {
  async recognize(bytes: Uint8Array, mimeType: string): Promise<string> {
    const serviceUrl = process.env.AGENT_SERVICE_URL;
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (!serviceUrl || !token) {
      throw new OcrUnavailableError('OCR 服务地址或内部凭证未配置');
    }

    let response: Response;
    try {
      response = await fetch(new URL('/internal/knowledge/ocr', serviceUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageBase64: Buffer.from(bytes).toString('base64'),
          mimeType,
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new OcrUnavailableError();
    }
    if (!response.ok) {
      throw new OcrUnavailableError();
    }

    let body: { text?: unknown };
    try {
      body = (await response.json()) as { text?: unknown };
    } catch {
      throw new OcrUnavailableError();
    }
    if (typeof body.text !== 'string') {
      throw new OcrUnavailableError();
    }
    return body.text;
  }
}
