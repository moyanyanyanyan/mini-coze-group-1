import pdfParse from 'pdf-parse-legacy';
import { AttachmentError, type AttachmentInput } from '../attachment.types';
import { normalizeText } from './text.parser';

export async function parsePdf(input: AttachmentInput): Promise<string> {
  try {
    // pdf-parse 1.1.1 的 pdf.js 处理 Buffer 时会忽略 byteOffset、直接读底层 ArrayBuffer，
    // 进程里先加载过 exceljs 等库后甚至 byteOffset=0 也会读错；传普通 Uint8Array 才稳定。
    const copy = new Uint8Array(input.bytes.byteLength);
    copy.set(input.bytes);
    const result = await pdfParse(copy as unknown as Buffer);
    return normalizeText(result.text);
  } catch (error) {
    if (error instanceof AttachmentError) {
      throw error;
    }
    throw new AttachmentError('CORRUPT_FILE', 'PDF 文件无法解析');
  }
}
