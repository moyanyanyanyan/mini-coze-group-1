import mammoth from 'mammoth';
import { MAX_OFFICE_DOCUMENT_BYTES } from '../document-content';
import type { Extractor } from './types';

// DOCX 使用 mammoth 提取纯文本，保留段落顺序。
export function createDocxExtractor(): Extractor {
  return {
    sourceType: 'DOCX',
    extensions: ['.docx'],
    maxBytes: MAX_OFFICE_DOCUMENT_BYTES,
    async extract({ bytes }) {
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      return result.value;
    },
  };
}
