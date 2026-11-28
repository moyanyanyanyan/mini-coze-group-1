import { extname } from 'node:path';
import {
  parseOffice,
  type DecompressionLimits,
  type OfficeParserAST,
} from 'officeparser';
import { imageMaxBytes, officeMaxBytes } from '../../../config/upload-limits';
import type { OcrWorkerClient } from '../../../integrations/ocr-worker.client';
import { DocumentContentError } from './document-content';
import { recognizeImageText } from './image-document-content';
import {
  applyOfficeImageText,
  convertOfficeAst,
  type NormalizedOfficeDocument,
  type OfficeBlock,
  type OfficeFormat,
} from './office-ast-converter';

export type OfficeParseWarningCode =
  | 'IMAGE_OCR_SKIPPED'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_OCR_LIMIT_REACHED';

export interface OfficeParseWarning {
  code: OfficeParseWarningCode;
  imageId: string;
  message: string;
}

export interface OfficeDocumentParseResult {
  document: NormalizedOfficeDocument;
  warnings: OfficeParseWarning[];
}

const OCR_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export const OFFICE_DECOMPRESSION_LIMITS: DecompressionLimits = {
  maxUncompressedBytes: 128 * 1024 * 1024,
  maxZipEntries: 2_000,
  maxTableCells: 200_000,
  maxXmlElements: 1_000_000,
  maxRepeatedContent: 8 * 1024 * 1024,
  maxRawContentLength: 16 * 1024 * 1024,
};

export const OFFICE_PARSE_TIMEOUT_MS = 120_000;
export const MAX_OFFICE_ATTACHMENTS = 200;
export const MAX_OFFICE_OCR_IMAGES = 50;
export const MAX_OFFICE_OCR_BYTES = 50 * 1024 * 1024;
export const MAX_OFFICE_TEXT_CHARS = 1_000_000;

const RESOURCE_LIMIT_ERROR_CODES = new Set([
  'ZIP_ENTRY_COUNT_LIMIT_EXCEEDED',
  'ZIP_SIZE_LIMIT_EXCEEDED',
  'XML_ELEMENT_LIMIT_EXCEEDED',
]);

const RESOURCE_LIMIT_WARNING_CODES = new Set([
  'TABLE_CELL_LIMIT_EXCEEDED',
  'REPEATED_CONTENT_LIMIT_EXCEEDED',
  'RAW_CONTENT_LIMIT_EXCEEDED',
]);

export function officeFormatFromFilename(
  filename: string,
): OfficeFormat | null {
  const extension = extname(filename).toLowerCase();
  if (extension === '.docx') {
    return 'docx';
  }
  if (extension === '.pptx') {
    return 'pptx';
  }
  return null;
}

function readableImageIds(document: NormalizedOfficeDocument): Set<string> {
  const ids = new Set<string>();

  function visitBlocks(blocks: OfficeBlock[]): void {
    for (const block of blocks) {
      if (block.kind === 'paragraph') {
        block.imageIds.forEach((id) => ids.add(id));
      } else if (block.kind === 'textBox') {
        block.paragraphs.forEach((paragraph) =>
          paragraph.imageIds.forEach((id) => ids.add(id)),
        );
      } else if (block.kind === 'table') {
        for (const row of block.rows) {
          for (const cell of row) {
            visitBlocks(cell.blocks);
          }
        }
      } else if (block.kind === 'image') {
        ids.add(block.imageId);
      }
    }
  }

  document.sections.forEach((section) => visitBlocks(section.blocks));
  return ids;
}

function formatLabel(format: OfficeFormat): string {
  return format === 'docx' ? 'Word 文档' : 'PPT 演示文稿';
}

/**
 * Parses DOCX/PPTX through officeparser, converts the format-specific AST into the
 * shared Office AST, and runs embedded pictures through the existing OCR Worker.
 * No new OCR client or worker endpoint is introduced.
 */
export async function extractOfficeDocument(
  bytes: Uint8Array,
  filename: string,
  worker: Pick<OcrWorkerClient, 'recognizeImage'>,
): Promise<OfficeDocumentParseResult> {
  if (bytes.byteLength === 0) {
    throw new DocumentContentError('EMPTY_CONTENT', 'Office 文档内容不能为空');
  }
  if (bytes.byteLength > officeMaxBytes()) {
    throw new DocumentContentError('FILE_TOO_LARGE', 'Office 文件超过上传大小限制');
  }
  const format = officeFormatFromFilename(filename);
  if (!format) {
    throw new DocumentContentError(
      'UNSUPPORTED_FILE',
      '只支持 .docx 和 .pptx 文件',
    );
  }

  let ast: OfficeParserAST;
  try {
    ast = await parseOffice(Buffer.from(bytes), {
      extractAttachments: true,
      ocr: false,
      ignoreSlideMasters: true,
      decompressionLimits: OFFICE_DECOMPRESSION_LIMITS,
      abortSignal: AbortSignal.timeout(OFFICE_PARSE_TIMEOUT_MS),
    });
  } catch (error) {
    const code = (error as { officeIssue?: { code?: string } } | null)
      ?.officeIssue?.code;
    if (code === 'OPERATION_ABORTED') {
      throw new DocumentContentError(
        'OFFICE_PARSE_TIMEOUT',
        `${formatLabel(format)}解析超时`,
      );
    }
    if (code !== undefined && RESOURCE_LIMIT_ERROR_CODES.has(code)) {
      throw new DocumentContentError(
        'OFFICE_RESOURCE_LIMIT',
        `${formatLabel(format)}超过安全解析限制`,
      );
    }
    throw new DocumentContentError(
      'INVALID_OFFICE_DOCUMENT',
      `${formatLabel(format)}无法解析`,
    );
  }
  if (
    ast.warnings.some((warning) =>
      RESOURCE_LIMIT_WARNING_CODES.has(warning.code),
    )
  ) {
    throw new DocumentContentError(
      'OFFICE_RESOURCE_LIMIT',
      `${formatLabel(format)}超过安全解析限制`,
    );
  }
  if (ast.attachments.length > MAX_OFFICE_ATTACHMENTS) {
    throw new DocumentContentError(
      'OFFICE_RESOURCE_LIMIT',
      `${formatLabel(format)}附件数量超过安全限制`,
    );
  }
  if (ast.type !== format) {
    throw new DocumentContentError(
      'INVALID_OFFICE_DOCUMENT',
      `${formatLabel(format)}的文件内容与扩展名不一致`,
    );
  }

  const document = convertOfficeAst(ast);
  const warnings: OfficeParseWarning[] = [];
  const readable = readableImageIds(document);
  const recognizedByAttachment = new Map<number, string>();
  const textsByImage = new Map<string, string>();
  let ocrImageCount = 0;
  let ocrByteCount = 0;

  for (const image of document.images) {
    if (!readable.has(image.id) || image.attachmentIndex === null) {
      continue;
    }
    const attachmentIndex = image.attachmentIndex;
    const attachment = document.attachments[attachmentIndex];
    if (!attachment || !attachment.data) {
      warnings.push({
        code: 'IMAGE_OCR_SKIPPED',
        imageId: image.id,
        message: '图片没有可读取的附件数据，已跳过 OCR',
      });
      continue;
    }
    const mimeType = (
      image.mimeType ??
      attachment.mimeType ??
      ''
    ).toLowerCase();
    if (!OCR_IMAGE_MIME_TYPES.has(mimeType)) {
      warnings.push({
        code: 'IMAGE_OCR_SKIPPED',
        imageId: image.id,
        message: `图片格式 ${mimeType || 'unknown'} 不支持 OCR，已跳过`,
      });
      continue;
    }

    const cached = recognizedByAttachment.get(attachmentIndex);
    if (cached !== undefined) {
      if (cached) {
        textsByImage.set(image.id, cached);
      }
      continue;
    }

    const imageBytes = Buffer.from(attachment.data, 'base64');
    if (imageBytes.byteLength === 0) {
      warnings.push({
        code: 'IMAGE_OCR_SKIPPED',
        imageId: image.id,
        message: '图片附件为空，已跳过 OCR',
      });
      recognizedByAttachment.set(attachmentIndex, '');
      continue;
    }
    if (imageBytes.byteLength > imageMaxBytes()) {
      warnings.push({
        code: 'IMAGE_TOO_LARGE',
        imageId: image.id,
        message: '内嵌图片超过 OCR 大小限制，已跳过 OCR',
      });
      recognizedByAttachment.set(attachmentIndex, '');
      continue;
    }
    if (
      ocrImageCount >= MAX_OFFICE_OCR_IMAGES ||
      ocrByteCount + imageBytes.byteLength > MAX_OFFICE_OCR_BYTES
    ) {
      warnings.push({
        code: 'IMAGE_OCR_LIMIT_REACHED',
        imageId: image.id,
        message: 'Office 文档的内嵌图片 OCR 数量或总大小超过限制，已跳过后续图片',
      });
      recognizedByAttachment.set(attachmentIndex, '');
      continue;
    }

    ocrImageCount += 1;
    ocrByteCount += imageBytes.byteLength;
    const text = await recognizeImageText(
      imageBytes,
      image.attachmentName ?? attachment.name,
      mimeType,
      worker,
    );
    recognizedByAttachment.set(attachmentIndex, text);
    if (text) {
      textsByImage.set(image.id, text);
    }
  }

  applyOfficeImageText(document, textsByImage);
  if (!document.rawText) {
    throw new DocumentContentError(
      'EMPTY_CONTENT',
      `${formatLabel(format)}中没有可提取的文本`,
    );
  }
  if (document.rawText.length > MAX_OFFICE_TEXT_CHARS) {
    throw new DocumentContentError(
      'OFFICE_TEXT_TOO_LARGE',
      `${formatLabel(format)}提取文本超过安全限制`,
    );
  }
  return { document, warnings };
}

/** The service only needs the searchable text; the structured AST stays available for later phases. */
export async function extractOfficeDocumentText(
  bytes: Uint8Array,
  filename: string,
  worker: Pick<OcrWorkerClient, 'recognizeImage'>,
): Promise<string> {
  return (await extractOfficeDocument(bytes, filename, worker)).document
    .rawText;
}
