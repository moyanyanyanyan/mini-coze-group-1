export const MAX_TEXT_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_OFFICE_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_OFFICE_DOCUMENT_BYTES;

export class DocumentContentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// OCR 服务未配置或调用失败时抛出，由业务层映射为 OCR_UNAVAILABLE。
export class OcrUnavailableError extends Error {
  constructor(message = 'OCR 服务不可用，请稍后重试') {
    super(message);
  }
}

export function decodeUploadFilename(filename: string): string {
  // 部分 multipart 解析器会把 UTF-8 文件名字节当作 Latin-1 处理。
  // 已是 Unicode 或真实 Latin-1 名称时保持原样。
  // 存在 Latin-1 范围之外的字符时，说明文件名已是正常 Unicode，直接返回。
  if ([...filename].some((char) => (char.codePointAt(0) ?? 0) > 0xff)) {
    return filename;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.from(filename, 'latin1'),
    );
  } catch {
    return filename;
  }
}

export type { DocumentSourceType } from './extractors/types';
