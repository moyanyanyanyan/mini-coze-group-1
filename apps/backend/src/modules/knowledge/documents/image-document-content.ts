import { extname } from 'node:path';
import { imageMaxBytes } from '../../../config/upload-limits';
import { OcrWorkerError, type OcrWorkerClient, type OcrWorkerResponse } from '../../../integrations/ocr-worker.client';
import { DocumentContentError } from './document-content';

export type ImageSourceFormat = 'PNG' | 'JPEG';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

// Some multipart clients label .jpg uploads as image/jpg; both map to JPEG.
const IMAGE_MIME_TYPES: Record<ImageSourceFormat, readonly string[]> = {
  PNG: ['image/png'],
  JPEG: ['image/jpeg', 'image/jpg'],
};

export function imageFormatFromFilename(filename: string): ImageSourceFormat | null {
  const extension = extname(filename).toLowerCase();
  if (extension === '.png') return 'PNG';
  if (extension === '.jpg' || extension === '.jpeg') return 'JPEG';
  return null;
}

export function imageMimeType(format: ImageSourceFormat): string {
  return format === 'PNG' ? 'image/png' : 'image/jpeg';
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.byteLength >= signature.length && signature.every((value, index) => bytes[index] === value);
}

/** Rejects extension/MIME mismatches and renamed files whose content does not match the extension. */
export function assertImageUpload(filename: string, mimeType: string | undefined, bytes: Uint8Array): ImageSourceFormat {
  const format = imageFormatFromFilename(filename);
  if (!format) throw new DocumentContentError('UNSUPPORTED_FILE', '只支持 .png、.jpg 和 .jpeg 图片');
  const normalizedMime = mimeType?.trim().toLowerCase();
  if (!normalizedMime) throw new DocumentContentError('UNSUPPORTED_FILE', '无法确认图片的 MIME 类型');
  if (!IMAGE_MIME_TYPES[format].includes(normalizedMime)) {
    throw new DocumentContentError('UNSUPPORTED_FILE', '图片扩展名与 MIME 类型不一致');
  }
  const signatureMatches = format === 'PNG' ? startsWith(bytes, PNG_SIGNATURE) : startsWith(bytes, JPEG_SIGNATURE);
  if (!signatureMatches) throw new DocumentContentError('UNSUPPORTED_FILE', '图片文件内容与扩展名不一致');
  return format;
}

/**
 * Calls the shared OCR Worker image endpoint and validates its single-page response.
 * Returns an empty string for an image without recognized text, so callers can decide
 * whether that is an error (a standalone image upload) or merely an image with no text
 * (an embedded Office picture).
 */
export async function recognizeImageText(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  worker: Pick<OcrWorkerClient, 'recognizeImage'>,
): Promise<string> {
  const response: OcrWorkerResponse = await worker.recognizeImage(Buffer.from(bytes), filename, mimeType);
  const page = response.pages?.[0];
  if (response.status !== 'ok' || !Array.isArray(response.pages) || response.pages.length !== 1 ||
      page?.pageNumber !== 1 || page?.method !== 'ocr' || typeof page?.text !== 'string') {
    throw new OcrWorkerError('INVALID_RESPONSE', 'OCR Worker 返回的图片页码或内容无效');
  }
  return page.text.replace(/\r\n?/g, '\n').trim();
}

/**
 * Sends the original image bytes to the existing OCR Worker client and returns the
 * recognized text. The caller keeps using the shared Chunk / Embedding / Vector path.
 */
export async function extractImageDocumentText(
  bytes: Uint8Array,
  filename: string | null | undefined,
  worker: Pick<OcrWorkerClient, 'recognizeImage'>,
): Promise<string> {
  if (bytes.byteLength === 0) throw new DocumentContentError('EMPTY_CONTENT', '图片文件内容不能为空');
  if (bytes.byteLength > imageMaxBytes()) throw new DocumentContentError('FILE_TOO_LARGE', '图片文件超过上传大小限制');
  const documentFilename = filename ?? '';
  const format = imageFormatFromFilename(documentFilename);
  if (!format) throw new DocumentContentError('UNSUPPORTED_FILE', '图片文档缺少有效的原始文件名');

  const text = await recognizeImageText(bytes, documentFilename, imageMimeType(format), worker);
  if (!text) throw new DocumentContentError('EMPTY_CONTENT', '图片中没有识别到有效文本');
  return text;
}
