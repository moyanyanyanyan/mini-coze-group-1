import { extractPdfDocumentPages } from './pdf-document-content';
import { extractHybridPdfDocumentText, selectPdfOcrPages } from './pdf-hybrid-document-content';

jest.mock('./pdf-document-content', () => ({ extractPdfDocumentPages: jest.fn() }));

describe('PDF page OCR selection', () => {
  it('keeps valid native bodies even when they are short', () => {
    expect(selectPdfOcrPages([
      { pdfPageNumber: 1, text: '短正文' },
      { pdfPageNumber: 2, text: 'Header\n有效正文\n2' },
    ])).toEqual([]);
  });

  it('selects blank pages, page numbers and clearly corrupted extracted text', () => {
    expect(selectPdfOcrPages([
      { pdfPageNumber: 1, text: '' },
      { pdfPageNumber: 2, text: 'Page 2 of 3' },
      { pdfPageNumber: 3, text: 'broken \uFFFD text' },
    ])).toEqual([1, 2, 3]);
  });

  it('recognizes repeated edge lines while keeping a native body between them', () => {
    expect(selectPdfOcrPages([
      { pdfPageNumber: 1, text: 'Header\nFooter\n1' },
      { pdfPageNumber: 2, text: 'Header\nmain content\nFooter\n2' },
      { pdfPageNumber: 3, text: 'Header\nFooter\n3' },
    ])).toEqual([1, 3]);
  });

  it('selects a page with a native title and an embedded scanned body', () => {
    expect(selectPdfOcrPages([
      { pdfPageNumber: 1, text: 'Contract terms', hasEmbeddedImage: true },
      { pdfPageNumber: 2, text: 'Native body', hasEmbeddedImage: false },
    ])).toEqual([1]);
  });

  it('does not OCR text-rich pages that merely carry a figure or logo', () => {
    const body = `figure caption ${'正文'.repeat(200)}`;
    expect(selectPdfOcrPages([
      { pdfPageNumber: 1, text: body, hasEmbeddedImage: true },
      { pdfPageNumber: 2, text: 'Short caption', hasEmbeddedImage: true },
    ])).toEqual([2]);
  });
});

describe('hybrid PDF text merging', () => {
  it('keeps the native title and adds OCR body without repeating the title', async () => {
    jest.mocked(extractPdfDocumentPages).mockResolvedValue([
      { pdfPageNumber: 1, text: 'Contract terms', hasEmbeddedImage: true },
    ]);
    const worker = { recognizePdfPages: jest.fn().mockResolvedValue({
      status: 'ok',
      pages: [{ pageNumber: 1, method: 'ocr', text: 'Contract terms\nScanned obligations' }],
    }) };

    const result = await extractHybridPdfDocumentText(Buffer.from('%PDF'), 'contract.pdf', worker);

    expect(worker.recognizePdfPages).toHaveBeenCalledWith(expect.any(Buffer), 'contract.pdf', [1], 200);
    expect(result.rawText).toBe('Contract terms\nScanned obligations');
    expect(result.pages[0].method).toBe('ocr');
  });
});
