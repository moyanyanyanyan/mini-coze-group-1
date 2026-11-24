import { Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { DocumentContentError, OcrUnavailableError } from './document-content';
import { OcrClient } from './ocr.client';
import { createCsvExtractor } from './extractors/csv.extractor';
import { createDocxExtractor } from './extractors/docx.extractor';
import { createHtmlExtractor } from './extractors/html.extractor';
import { createImageExtractor } from './extractors/image.extractor';
import { createPdfExtractor } from './extractors/pdf.extractor';
import { createPptxExtractor } from './extractors/pptx.extractor';
import {
  createJsonExtractor,
  createTextExtractor,
} from './extractors/text.extractor';
import { createXlsxExtractor } from './extractors/xlsx.extractor';
import type {
  DocumentSourceType,
  ExtractInput,
  Extractor,
} from './extractors/types';

// 解析器注册表：按扩展名匹配解析器，按 sourceType 调度抽取。
@Injectable()
export class DocumentExtractorService {
  private readonly byExtension = new Map<string, Extractor>();
  private readonly bySourceType = new Map<DocumentSourceType, Extractor>();

  constructor(ocr: OcrClient) {
    const extractors: Extractor[] = [
      createTextExtractor('TEXT', []),
      createTextExtractor('TXT', ['.txt']),
      createTextExtractor('MD', ['.md']),
      createJsonExtractor(),
      createHtmlExtractor(),
      createCsvExtractor(),
      createXlsxExtractor(),
      createDocxExtractor(),
      createPptxExtractor(),
      createPdfExtractor(),
      createImageExtractor(ocr),
    ];
    for (const extractor of extractors) {
      if (this.bySourceType.has(extractor.sourceType)) {
        throw new Error(`重复的来源类型映射：${extractor.sourceType}`);
      }
      this.bySourceType.set(extractor.sourceType, extractor);
      for (const extension of extractor.extensions) {
        if (this.byExtension.has(extension)) {
          throw new Error(`重复的扩展名映射：${extension}`);
        }
        this.byExtension.set(extension, extractor);
      }
    }
  }

  resolve(filename: string): Extractor {
    const extension = extname(filename).toLowerCase();
    const extractor = this.byExtension.get(extension);
    if (!extractor) {
      throw new DocumentContentError(
        'UNSUPPORTED_FILE',
        '只支持 TXT、Markdown、HTML、CSV、Excel、Word、PowerPoint、PDF 和图片文件',
      );
    }
    return extractor;
  }

  async extract(
    sourceType: DocumentSourceType,
    input: ExtractInput,
  ): Promise<string> {
    const extractor = this.bySourceType.get(sourceType);
    if (!extractor) {
      throw new DocumentContentError('UNSUPPORTED_FILE', '不支持的文件类型');
    }
    if (input.bytes.byteLength === 0) {
      throw new DocumentContentError('EMPTY_CONTENT', '资料内容不能为空');
    }
    if (input.bytes.byteLength > extractor.maxBytes) {
      throw new DocumentContentError(
        'FILE_TOO_LARGE',
        '文件超过该类型的大小上限',
      );
    }

    let text: string;
    try {
      text = await extractor.extract(input);
    } catch (error) {
      if (
        error instanceof DocumentContentError ||
        error instanceof OcrUnavailableError
      ) {
        throw error;
      }
      throw new DocumentContentError(
        'CORRUPT_FILE',
        '文件无法解析，请确认文件未损坏或未加密',
      );
    }

    const normalized = text.trim();
    if (!normalized) {
      throw new DocumentContentError('EMPTY_CONTENT', '文件中没有可检索文本');
    }
    return normalized;
  }
}
