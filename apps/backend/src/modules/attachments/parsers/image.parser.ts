import type { AttachmentInput } from '../attachment.types';
import type { OcrClient } from '../ocr.client';

/** 图片只走 OCR；识别不到文字由注册表统一判为 EMPTY_CONTENT。 */
export async function parseImage(input: AttachmentInput, ocr: OcrClient): Promise<string> {
  return ocr.recognize(input.bytes, input.mimeType);
}
