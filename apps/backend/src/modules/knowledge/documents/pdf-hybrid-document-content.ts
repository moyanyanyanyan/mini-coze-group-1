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

/** Uses only structural evidence; a short but valid body is not assumed to be a scan. */
export function selectPdfOcrPages(pages: readonly NativePdfPage[]): number[] {
  const repeatedEdges = edgeLines(pages);
  return pages.filter((page) => {
    if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(page.text)) return true;
    const lines = page.text.split('\n').map((line) => line.trim()).filter(Boolean);
    const edges = pageEdges(lines);
    const meaningful = lines.filter((line) => !isPageNumber(line) && !(edges.has(line) && repeatedEdges.has(line)));
    return meaningful.length === 0;
  }).map((page) => page.pdfPageNumber);
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
    text: recognized.get(page.pdfPageNumber) ?? page.text,
  }));
  const rawText = pages.map((page) => page.text).filter(Boolean).join('\n\n');
  if (!rawText) throw new DocumentContentError('EMPTY_CONTENT', 'PDF 文件没有可识别的文本');
  return { pages, rawText };
}
