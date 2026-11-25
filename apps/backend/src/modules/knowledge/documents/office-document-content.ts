import { extname } from 'node:path';
import { parseOffice, type OfficeParserAST } from 'officeparser';
import { imageMaxBytes } from '../../../config/upload-limits';
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

export type OfficeParseWarningCode = 'IMAGE_OCR_SKIPPED' | 'IMAGE_TOO_LARGE';

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
    });
  } catch {
    throw new DocumentContentError(
      'INVALID_OFFICE_DOCUMENT',
      `${formatLabel(format)}无法解析`,
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

  for (const image of document.images) {
    if (!readable.has(image.id)) {
      continue;
    }
    const attachment =
      image.attachmentIndex === null
        ? undefined
        : document.attachments[image.attachmentIndex];
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

    const cached = recognizedByAttachment.get(image.attachmentIndex as number);
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
      recognizedByAttachment.set(image.attachmentIndex as number, '');
      continue;
    }
    if (imageBytes.byteLength > imageMaxBytes()) {
      warnings.push({
        code: 'IMAGE_TOO_LARGE',
        imageId: image.id,
        message: '内嵌图片超过 OCR 大小限制，已跳过 OCR',
      });
      recognizedByAttachment.set(image.attachmentIndex as number, '');
      continue;
    }

    const text = await recognizeImageText(
      imageBytes,
      image.attachmentName ?? attachment.name,
      mimeType,
      worker,
    );
    recognizedByAttachment.set(image.attachmentIndex as number, text);
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
