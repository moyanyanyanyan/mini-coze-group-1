import { PDFParse } from 'pdf-parse';
import { DocumentContentError, MAX_PDF_DOCUMENT_BYTES } from './document-content';

export async function extractPdfDocumentText(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength === 0) throw new DocumentContentError('EMPTY_CONTENT', 'PDF 文件内容不能为空');
  if (bytes.byteLength > MAX_PDF_DOCUMENT_BYTES) throw new DocumentContentError('FILE_TOO_LARGE', 'PDF 文件不能超过 10 MiB');

  const parser = new PDFParse({ data: bytes });
  try {
    let result: Awaited<ReturnType<PDFParse['getText']>>;
    try {
      result = await parser.getText();
    } catch {
      throw new DocumentContentError('INVALID_PDF', 'PDF 文件无法解析');
    }

    const text = result.pages
      .slice()
      .sort((a, b) => a.num - b.num)
      .map((page) => page.text.replace(/\r\n?/g, '\n').trim())
      .filter(Boolean)
      .join('\n\n');
    if (!text) throw new DocumentContentError('EMPTY_CONTENT', 'PDF 文件没有可提取的文本');
    return text;
  } finally {
    await parser.destroy();
  }
}
