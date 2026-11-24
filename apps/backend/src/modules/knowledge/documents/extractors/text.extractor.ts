import {
  DocumentContentError,
  MAX_TEXT_DOCUMENT_BYTES,
} from '../document-content';
import type { Extractor } from './types';
import { decodeUtf8 } from './text-utils';

// TXT、粘贴文本与 Markdown 共用 UTF-8 文本解析，Markdown 额外去除 YAML front matter。
export function createTextExtractor(
  sourceType: 'TEXT' | 'TXT' | 'MD',
  extensions: readonly string[],
): Extractor {
  return {
    sourceType,
    extensions,
    maxBytes: MAX_TEXT_DOCUMENT_BYTES,
    async extract({ bytes }) {
      const decoded = decodeUtf8(bytes);
      if (sourceType !== 'MD') {
        return decoded.trim();
      }
      return decoded.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
    },
  };
}

// JSON 按键路径扁平化为 path: value，便于切片与检索。
export function createJsonExtractor(): Extractor {
  return {
    sourceType: 'JSON',
    extensions: ['.json'],
    maxBytes: MAX_TEXT_DOCUMENT_BYTES,
    async extract({ bytes }) {
      const decoded = decodeUtf8(bytes);
      let parsed: unknown;
      try {
        parsed = JSON.parse(decoded);
      } catch {
        throw new DocumentContentError('INVALID_JSON', 'JSON 文件格式无效');
      }

      const lines: string[] = [];
      function visit(value: unknown, path: string) {
        if (Array.isArray(value)) {
          value.forEach((item, index) => visit(item, `${path}[${index}]`));
        } else if (value !== null && typeof value === 'object') {
          for (const [key, item] of Object.entries(value)) {
            visit(item, path ? `${path}.${key}` : key);
          }
        } else {
          lines.push(`${path || 'value'}: ${String(value)}`);
        }
      }
      visit(parsed, '');
      if (lines.length === 0) {
        throw new DocumentContentError(
          'EMPTY_CONTENT',
          'JSON 中没有可检索内容',
        );
      }
      return lines.join('\n');
    },
  };
}
