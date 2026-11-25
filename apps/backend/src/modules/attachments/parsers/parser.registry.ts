import { Injectable } from '@nestjs/common';
import { AttachmentError, type AttachmentInput } from '../attachment.types';
import { isImageType, isOfficeType } from './file-type';
import { parseImage } from './image.parser';
import { OcrClient } from '../ocr.client';
import { VisionClient } from '../vision.client';
import { parseOffice } from './office.parser';
import { parsePdf } from './pdf.parser';
import { parseText } from './text.parser';

/**
 * 按来源类型路由到具体解析器。
 * 所有解析器都返回纯文本；这里统一 trim 并判定空内容，
 * 避免各解析器重复写同一段失败逻辑。
 */
@Injectable()
export class AttachmentParserRegistry {
  constructor(
    private readonly ocr: OcrClient,
    private readonly vision: VisionClient,
  ) {}

  async parse(input: AttachmentInput): Promise<string> {
    const text = await this.dispatch(input);
    const normalized = text.trim();
    if (!normalized) {
      throw new AttachmentError('EMPTY_CONTENT', '文件中没有可提取的文本');
    }
    return normalized;
  }

  private dispatch(input: AttachmentInput): Promise<string> | string {
    if (input.sourceType === 'PDF') {
      return parsePdf(input);
    }
    if (isOfficeType(input.sourceType)) {
      return parseOffice(input);
    }
    if (isImageType(input.sourceType)) {
      return parseImage(input, this.ocr, this.vision);
    }
    return parseText(input);
  }
}
