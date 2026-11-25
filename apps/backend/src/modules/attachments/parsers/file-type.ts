import { AttachmentError, type AttachmentSourceType } from '../attachment.types';

/** 文本 2 MB、Office/PDF 20 MB、图片 5 MB；multer 只做 20 MB 全局兜底。 */
const TEXT_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const OFFICE_MAX_BYTES = 20 * 1024 * 1024;

export const MAX_UPLOAD_BYTES = OFFICE_MAX_BYTES;

const SOURCE_TYPE_BY_EXTENSION: Record<string, AttachmentSourceType> = {
  '.pdf': 'PDF',
  '.docx': 'DOCX',
  '.md': 'MD',
  '.markdown': 'MD',
  '.xlsx': 'XLSX',
  '.csv': 'CSV',
  '.png': 'PNG',
  '.jpg': 'JPG',
  '.jpeg': 'JPEG',
  '.webp': 'WEBP',
  '.pptx': 'PPTX',
  '.html': 'HTML',
  '.htm': 'HTML',
};

const MIME_BY_SOURCE_TYPE: Record<AttachmentSourceType, string> = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  MD: 'text/markdown',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv',
  PNG: 'image/png',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  WEBP: 'image/webp',
  PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  HTML: 'text/html',
};

const TEXT_TYPES = new Set<AttachmentSourceType>(['MD', 'HTML', 'CSV']);
const IMAGE_TYPES = new Set<AttachmentSourceType>(['PNG', 'JPG', 'JPEG', 'WEBP']);
const OFFICE_TYPES = new Set<AttachmentSourceType>(['DOCX', 'PPTX', 'XLSX']);

export function isTextType(type: AttachmentSourceType): boolean {
  return TEXT_TYPES.has(type);
}

export function isImageType(type: AttachmentSourceType): boolean {
  return IMAGE_TYPES.has(type);
}

export function isOfficeType(type: AttachmentSourceType): boolean {
  return OFFICE_TYPES.has(type);
}

export function resolveSourceType(fileName: string): AttachmentSourceType {
  const dot = fileName.lastIndexOf('.');
  const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  const sourceType = SOURCE_TYPE_BY_EXTENSION[extension];
  if (!sourceType) {
    throw new AttachmentError('UNSUPPORTED_FILE', `不支持的文件类型：${extension || '未知'}`);
  }
  return sourceType;
}

export function maxBytesFor(type: AttachmentSourceType): number {
  if (TEXT_TYPES.has(type)) {return TEXT_MAX_BYTES;}
  if (IMAGE_TYPES.has(type)) {return IMAGE_MAX_BYTES;}
  return OFFICE_MAX_BYTES;
}

export function mimeTypeFor(type: AttachmentSourceType): string {
  return MIME_BY_SOURCE_TYPE[type];
}

/**
 * magic bytes 校验。扩展名可以随便改，但文件头改不了，
 * 用它挡掉「把 exe 改名成 pdf」这类输入，避免解析器读到一半炸出 500。
 */
export function assertMagicBytes(type: AttachmentSourceType, bytes: Uint8Array): void {
  if (bytes.length === 0) {
    throw new AttachmentError('CORRUPT_FILE', '文件内容为空');
  }
  if (TEXT_TYPES.has(type)) {
    return;
  }
  let matched = false;
  if (type === 'PDF') {
    matched = startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
  } else if (type === 'PNG') {
    matched = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  } else if (type === 'JPG' || type === 'JPEG') {
    matched = startsWith(bytes, [0xff, 0xd8, 0xff]);
  } else if (type === 'WEBP') {
    matched = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) // RIFF
      && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]); // WEBP
  } else if (OFFICE_TYPES.has(type)) {
    matched = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]); // zip
  }
  if (!matched) {
    throw new AttachmentError('CORRUPT_FILE', '文件内容与扩展名不匹配');
  }
}

/**
 * 文件名只用于展示，这里同时做三件事：
 *   1. 去掉客户端可能带上的目录（防路径穿越）
 *   2. 修复 busboy 把 UTF-8 文件名按 latin1 解码导致的乱码
 *   3. 去掉控制字符并截断到 255，避免脏数据入库
 */
export function normalizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  const repaired = repairLatin1(base);
  const clean = repaired.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || '未命名文件').slice(0, 255);
}

function repairLatin1(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded.includes('\ufffd')) {
    return name;
  }
  // 只在还原出中文时才采用，避免把本来就是 latin1 的文件名改坏
  return /[\u3000-\u9fff]/.test(decoded) ? decoded : name;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}
