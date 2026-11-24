import { DocumentContentError } from '../document-content';

// 严格按 UTF-8 解码，失败时不写入替换字符，避免脏文本进入检索。
export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, '');
  } catch {
    throw new DocumentContentError(
      'INVALID_ENCODING',
      '资料必须使用 UTF-8 编码',
    );
  }
}

// 统一换行、去除行尾空格并压缩多余空行。
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// 解码 PPTX 等 XML 中的常见实体与数字实体。
export function decodeXmlEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        return decodeCodePoint(Number.parseInt(entity.slice(2), 16), match);
      }
      if (entity.startsWith('#')) {
        return decodeCodePoint(Number.parseInt(entity.slice(1), 10), match);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

function decodeCodePoint(code: number, fallback: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
    return fallback;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}
