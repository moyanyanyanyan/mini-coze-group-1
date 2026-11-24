import { extname } from 'node:path';
import { MAX_IMAGE_DOCUMENT_BYTES } from '../document-content';
import type { OcrClient } from '../ocr.client';
import type { Extractor } from './types';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

// 图片不做本地 OCR，统一交给 agent 服务识别。
export function createImageExtractor(ocr: OcrClient): Extractor {
  return {
    sourceType: 'IMAGE',
    extensions: ['.png', '.jpg', '.jpeg', '.webp'],
    maxBytes: MAX_IMAGE_DOCUMENT_BYTES,
    async extract({ bytes, filename }) {
      const mimeType =
        MIME_BY_EXTENSION[extname(filename).toLowerCase()] ?? 'image/png';
      return ocr.recognize(bytes, mimeType);
    },
  };
}
