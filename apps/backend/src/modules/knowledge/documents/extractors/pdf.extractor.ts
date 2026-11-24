import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { MAX_OFFICE_DOCUMENT_BYTES } from '../document-content';
import type { Extractor } from './types';

// 直接引用内部实现，规避 pdf-parse 入口的调试文件读取分支。
export function createPdfExtractor(): Extractor {
  return {
    sourceType: 'PDF',
    extensions: ['.pdf'],
    maxBytes: MAX_OFFICE_DOCUMENT_BYTES,
    async extract({ bytes }) {
      // 复制为同域 Uint8Array，避免不同运行环境下 Buffer 的 instanceof 判断失效。
      const result = await pdfParse(new Uint8Array(bytes));
      return result.text;
    },
  };
}
