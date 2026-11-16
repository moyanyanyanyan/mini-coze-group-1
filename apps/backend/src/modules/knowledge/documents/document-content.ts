import { extname } from 'node:path';

export const MAX_DOCUMENT_BYTES = 1024 * 1024;

export class DocumentContentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function decodeUploadFilename(filename: string): string {
  // Multipart parsers may interpret UTF-8 filename bytes as Latin-1.
  // Leave already decoded Unicode and genuine Latin-1 names unchanged.
  if (/[^\u0000-\u00ff]/u.test(filename)) return filename;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(filename, 'latin1'));
  } catch {
    return filename;
  }
}

export function sourceTypeFromFilename(filename: string): 'TXT' | 'JSON' {
  const extension = extname(filename).toLowerCase();
  if (extension === '.txt') return 'TXT';
  if (extension === '.json') return 'JSON';
  throw new DocumentContentError('UNSUPPORTED_FILE', '只支持 .txt 和 .json 文件');
}

export interface DocumentTextPage {
  content: string;
  nextCursor: string | null;
  hasMore: boolean;
  totalLength: number;
}

function decodeTextCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Number.isInteger(value) || value < 0) throw new Error('invalid cursor');
    return value;
  } catch {
    throw new DocumentContentError('INVALID_CURSOR', '文本分页位置无效');
  }
}

export function readDocumentTextPage(text: string, cursor?: string, requestedLimit = 4000): DocumentTextPage {
  const characters = Array.from(text);
  const start = decodeTextCursor(cursor);
  if (start > characters.length) throw new DocumentContentError('INVALID_CURSOR', '文本分页位置无效');
  const limit = Math.min(Math.max(Math.trunc(requestedLimit) || 4000, 100), 5000);
  const targetEnd = Math.min(start + limit, characters.length);
  let end = targetEnd;
  if (targetEnd < characters.length) {
    const newline = characters.lastIndexOf('\n', targetEnd - 1);
    if (newline >= start + Math.floor(limit / 2)) end = newline + 1;
  }
  const hasMore = end < characters.length;
  return {
    content: characters.slice(start, end).join(''),
    nextCursor: hasMore ? Buffer.from(String(end), 'utf8').toString('base64url') : null,
    hasMore,
    totalLength: characters.length,
  };
}

export function extractDocumentText(sourceType: 'TEXT' | 'TXT' | 'JSON', bytes: Uint8Array): string {
  if (bytes.byteLength === 0) throw new DocumentContentError('EMPTY_CONTENT', '资料内容不能为空');
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentContentError('FILE_TOO_LARGE', '资料不能超过 1 MB');

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    throw new DocumentContentError('INVALID_ENCODING', '资料必须使用 UTF-8 编码');
  }

  if (sourceType !== 'JSON') {
    const text = decoded.replace(/\r\n?/g, '\n').trim();
    if (!text) throw new DocumentContentError('EMPTY_CONTENT', '资料内容不能为空');
    return text;
  }

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
      for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key);
    } else {
      lines.push(`${path || 'value'}: ${String(value)}`);
    }
  }
  visit(parsed, '');
  if (lines.length === 0) throw new DocumentContentError('EMPTY_CONTENT', 'JSON 中没有可检索内容');
  return lines.join('\n');
}
