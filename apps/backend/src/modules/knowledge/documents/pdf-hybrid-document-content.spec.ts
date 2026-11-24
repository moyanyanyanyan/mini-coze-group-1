import { selectPdfOcrPages } from './pdf-hybrid-document-content';

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
});
