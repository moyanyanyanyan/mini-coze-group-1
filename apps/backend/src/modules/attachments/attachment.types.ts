/** 聊天附件支持的来源类型。扩展名映射集中在 parsers/file-type.ts。 */
export type AttachmentSourceType =
  | 'PDF'
  | 'DOCX'
  | 'MD'
  | 'XLSX'
  | 'CSV'
  | 'PNG'
  | 'JPG'
  | 'JPEG'
  | 'WEBP'
  | 'PPTX'
  | 'HTML';

export type AttachmentStatus = 'PARSING' | 'READY' | 'FAILED';

export type AttachmentErrorCode =
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'CORRUPT_FILE'
  | 'EMPTY_CONTENT'
  | 'OCR_UNAVAILABLE';

/**
 * 解析层统一错误。
 * 带 code 是为了让 Service 能把失败原因原样写给 MessageAttachment.errorCode，
 * 前端不需要解析文案。
 */
export class AttachmentError extends Error {
  constructor(
    readonly code: AttachmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AttachmentError';
  }
}

export interface AttachmentInput {
  fileName: string;
  mimeType: string;
  sourceType: AttachmentSourceType;
  bytes: Uint8Array;
}

/** 上传接口的回包结构（ResponseInterceptor 会包一层 code/message/data）。 */
export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  sourceType: AttachmentSourceType;
  byteSize: number;
  status: AttachmentStatus;
  textBytes: number;
  preview: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}
