import { OcrWorkerError, type OcrWorkerClient } from '../../../integrations/ocr-worker.client';
import { DocumentContentError } from './document-content';
import { extractPdfDocumentPages, type NativePdfPage } from './pdf-document-content';

export interface PdfDocumentPage {
  pdfPageNumber: number;
  text: string;
  method: 'native' | 'ocr';
}

function isPageNumber(line: string): boolean {
  return /^(?:第\s*)?\d+(?:\s*(?:\/|of)\s*\d+)?(?:\s*页)?$/iu.test(line) ||
    /^page\s+\d+(?:\s+of\s+\d+)?$/iu.test(line);
}

function edgeLines(pages: readonly NativePdfPage[]): Set<string> {
  const occurrences = new Map<string, number>();
  for (const page of pages) {
    const lines = page.text.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    for (const line of pageEdges(lines)) {
      occurrences.set(line, (occurrences.get(line) ?? 0) + 1);
    }
  }
  return new Set([...occurrences].filter(([, count]) => count >= 2).map(([line]) => line));
}

function pageEdges(lines: readonly string[]): Set<string> {
  if (lines.length < 2) return new Set();
  const first = lines.find((line) => !isPageNumber(line));
  const last = [...lines].reverse().find((line) => !isPageNumber(line));
  return new Set([first, last].filter((line): line is string => line !== undefined));
}

function hasCorruptNativeText(text: string): boolean {
  return /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text);
}

/**
 * A page whose selectable text is only a heading or caption can still hide an image-only body,
 * which is the shape this selects for OCR. Text-rich pages are left alone: the same image there
 * is normally a figure, and OCR-ing every illustrated page would exhaust the worker budget on
 * large native PDFs.
 */
const MIN_NATIVE_TEXT_BEFORE_SKIPPING_OCR = 400;

/**
 * Uses only structural evidence — corrupt text, an embedded image on a sparsely written page, or
 * a page whose text is just repeated edges and page numbers. A short but valid body without any
 * image is still not assumed to be a scan.
 */
export function selectPdfOcrPages(pages: readonly NativePdfPage[]): number[] {
  const repeatedEdges = edgeLines(pages);
  return pages.filter((page) => {
    if (hasCorruptNativeText(page.text)) {
      return true;
    }
    const lines = page.text.split('\n').map((line) => line.trim()).filter(Boolean);
    const edges = pageEdges(lines);
    const meaningful = lines.filter((line) => !isPageNumber(line) && !(edges.has(line) && repeatedEdges.has(line)));
    if (meaningful.length === 0) {
      return true;
    }
    return Boolean(page.hasEmbeddedImage) && meaningful.join('').length < MIN_NATIVE_TEXT_BEFORE_SKIPPING_OCR;
  }).map((page) => page.pdfPageNumber);
}

function mergeNativeAndOcrText(nativeText: string, ocrText: string): string {
  if (!nativeText) {
    return ocrText;
  }
  if (!ocrText) {
    return nativeText;
  }
  const nativeLines = nativeText.split('\n').map((line) => line.trim()).filter(Boolean);
  const seen = new Set(nativeLines.map((line) => line.replace(/\s+/gu, ' ').toLocaleLowerCase()));
  const additional = ocrText.split('\n').map((line) => line.trim()).filter((line) => {
    if (!line) {
      return false;
    }
    const key = line.replace(/\s+/gu, ' ').toLocaleLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return [...nativeLines, ...additional].join('\n');
}

export async function extractHybridPdfDocumentText(
  bytes: Uint8Array,
  filename: string,
  worker: Pick<OcrWorkerClient, 'recognizePdfPages'>,
): Promise<{ pages: PdfDocumentPage[]; rawText: string }> {
  // pdf-parse transfers (detaches) the caller's ArrayBuffer, so snapshot the OCR payload before parsing.
  const ocrPayload = Buffer.from(bytes);
  const nativePages = await extractPdfDocumentPages(bytes);
  const selected = selectPdfOcrPages(nativePages);
  const recognized = new Map<number, string>();
  if (selected.length > 0) {
    const response = await worker.recognizePdfPages(ocrPayload, filename, selected, 200);
    if (response.status !== 'ok' || response.pages.length !== selected.length ||
        response.pages.some((page, index) => page.pageNumber !== selected[index] ||
          page.method !== 'ocr' || typeof page.text !== 'string')) {
      throw new OcrWorkerError('INVALID_RESPONSE', 'OCR Worker 返回的 PDF 页码或内容无效');
    }
    response.pages.forEach((page) => recognized.set(page.pageNumber, page.text.replace(/\r\n?/g, '\n').trim()));
  }
  const pages: PdfDocumentPage[] = nativePages.map((page) => ({
    pdfPageNumber: page.pdfPageNumber,
    method: recognized.has(page.pdfPageNumber) ? 'ocr' : 'native',
    text: recognized.has(page.pdfPageNumber) && page.hasEmbeddedImage && !hasCorruptNativeText(page.text)
      ? mergeNativeAndOcrText(page.text, recognized.get(page.pdfPageNumber) ?? '')
      : recognized.get(page.pdfPageNumber) ?? page.text,
  }));
  const rawText = pages.map((page) => page.text).filter(Boolean).join('\n\n');
  if (!rawText) throw new DocumentContentError('EMPTY_CONTENT', 'PDF 文件没有可识别的文本');
  return { pages, rawText };
}
