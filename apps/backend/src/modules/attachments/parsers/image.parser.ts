import { Logger } from '@nestjs/common';
import type { AttachmentInput } from '../attachment.types';
import type { OcrClient } from '../ocr.client';
import type { VisionClient } from '../vision.client';

const logger = new Logger('AttachmentImageParser');

/** 图片并行做 OCR 与视觉描述；任一失败都保留另一部分，只有都为空才判 EMPTY_CONTENT。 */
export async function parseImage(
  input: AttachmentInput,
  ocr: OcrClient,
  vision: VisionClient,
): Promise<string> {
  const started = Date.now();
  const visionEnabled = process.env.VISION_ENABLED === 'true';
  const [ocrResult, visionResult] = await Promise.allSettled([
    ocr.recognize(input.bytes, input.mimeType),
    vision.describe(input.bytes, input.mimeType),
  ]);
  const text = ocrResult.status === 'fulfilled' ? ocrResult.value.trim() : '';
  const description = visionResult.status === 'fulfilled' ? visionResult.value.trim() : '';
  const visionState = !visionEnabled
    ? 'disabled'
    : visionResult.status === 'fulfilled' ? 'ok' : 'failed';
  logger.log(
    `vision=${visionState} `
    + `ocr=${ocrResult.status === 'fulfilled' ? 'ok' : 'failed'} ms=${Date.now() - started}`,
  );
  if (visionEnabled && visionResult.status === 'rejected') {
    const reason = visionResult.reason instanceof Error
      ? visionResult.reason.message
      : 'unknown';
    logger.warn(`vision degraded: ${reason}`);
  }

  const parts: string[] = [];
  if (description) {parts.push(`【图片内容】\n${description}`);}
  if (text) {parts.push(`【图片文字】\n${text}`);}
  return parts.join('\n\n');
}
