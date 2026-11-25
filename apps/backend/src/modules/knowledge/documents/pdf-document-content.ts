import { PDFParse } from 'pdf-parse';
import { DocumentContentError, pdfMaxBytes } from './document-content';

export interface NativePdfPage {
  pdfPageNumber: number;
  text: string;
  hasEmbeddedImage?: boolean;
}

export async function extractPdfDocumentPages(bytes: Uint8Array): Promise<NativePdfPage[]> {
  if (bytes.byteLength === 0) throw new DocumentContentError('EMPTY_CONTENT', 'PDF 文件内容不能为空');
  if (bytes.byteLength > pdfMaxBytes()) throw new DocumentContentError('FILE_TOO_LARGE', 'PDF 文件超过上传大小限制');

  const parser = new PDFParse({ data: bytes });
  try {
    let result: Awaited<ReturnType<PDFParse['getText']>>;
    try {
      result = await parser.getText();
    } catch {
      throw new DocumentContentError('INVALID_PDF', 'PDF 文件无法解析');
    }

    const pages = new Map<number, string>();
    for (const page of result.pages) {
      if (!Number.isSafeInteger(page.num) || page.num < 1 || typeof page.text !== 'string' || pages.has(page.num)) {
        throw new DocumentContentError('INVALID_PDF', 'PDF 文件页码或文本无效');
      }
      pages.set(page.num, page.text.replace(/\r\n?/g, '\n').trim());
    }
    const total = result.total ?? [...pages.keys()].reduce((max, number) => Math.max(max, number), 0);
    if (total === 0 && pages.size === 0) throw new DocumentContentError('EMPTY_CONTENT', 'PDF 文件没有可提取的文本');
    if (!Number.isSafeInteger(total) || total < 1 || [...pages.keys()].some((number) => number > total)) {
      throw new DocumentContentError('INVALID_PDF', 'PDF 文件页数无效');
    }
    const nativePages: NativePdfPage[] = Array.from({ length: total }, (_, index) => ({
      pdfPageNumber: index + 1,
      text: pages.get(index + 1) ?? '',
    }));
    const pagesWithNativeText = nativePages.filter((page) => page.text).map((page) => page.pdfPageNumber);
    if (pagesWithNativeText.length > 0) {
      // Inspect image presence without retaining image buffers or data URLs.
      // A page can contain a selectable title over an image-only body.
      let images: Awaited<ReturnType<PDFParse['getImage']>>;
      try {
        images = await parser.getImage({
          partial: pagesWithNativeText,
          imageThreshold: 0,
          imageBuffer: false,
          imageDataUrl: false,
        });
      } catch {
        throw new DocumentContentError('INVALID_PDF', 'PDF 图片结构无法解析');
      }
      const imagePages = new Set(images.pages.filter((page) => page.images.length > 0).map((page) => page.pageNumber));
      nativePages.forEach((page) => {
        if (imagePages.has(page.pdfPageNumber)) {
          page.hasEmbeddedImage = true;
        }
      });
    }
    return nativePages;
  } finally {
    await parser.destroy();
  }
}

export async function extractPdfDocumentText(bytes: Uint8Array): Promise<string> {
  const pages = await extractPdfDocumentPages(bytes);
  const text = pages.map((page) => page.text).filter(Boolean).join('\n\n');
  if (!text) throw new DocumentContentError('EMPTY_CONTENT', 'PDF 文件没有可提取的文本');
  return text;
}
