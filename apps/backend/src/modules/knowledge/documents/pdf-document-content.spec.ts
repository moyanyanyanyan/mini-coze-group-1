import { PDFParse } from 'pdf-parse';
import { DocumentContentError, MAX_PDF_DOCUMENT_BYTES } from './document-content';
import { extractPdfDocumentPages, extractPdfDocumentText } from './pdf-document-content';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));

const getText = jest.fn();
const destroy = jest.fn<Promise<void>, []>();
const parserConstructor = PDFParse as jest.MockedClass<typeof PDFParse>;

function bytesWithReportedLength(length: number): Uint8Array {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  // The parser is mocked. Check the byte boundary without allocating a large PDF.
  Object.defineProperty(bytes, 'byteLength', { value: length });
  return bytes;
}

beforeEach(() => {
  jest.clearAllMocks();
  destroy.mockResolvedValue(undefined);
  parserConstructor.mockImplementation(() => ({ getText, destroy }) as unknown as PDFParse);
});

describe('PDF document content', () => {
  it('joins page text in page number order and releases the parser', async () => {
    getText.mockResolvedValue({ pages: [{ num: 2, text: 'PDF_PAGE_TWO\r\nnext' }, { num: 1, text: ' PDF_PAGE_ONE ' }], text: 'ignored' });
    const bytes = new Uint8Array([37, 80, 68, 70]);
    await expect(extractPdfDocumentText(bytes)).resolves.toBe('PDF_PAGE_ONE\n\nPDF_PAGE_TWO\nnext');
    expect(parserConstructor).toHaveBeenCalledWith({ data: bytes });
    expect(getText).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('skips textless pages while retaining page order', async () => {
    getText.mockResolvedValue({ pages: [{ num: 1, text: '  ' }, { num: 2, text: 'second' }, { num: 3, text: 'third' }] });
    await expect(extractPdfDocumentText(new Uint8Array([1]))).resolves.toBe('second\n\nthird');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('retains blank pages and the original 1-based PDF page numbers', async () => {
    getText.mockResolvedValue({ total: 3, pages: [{ num: 3, text: 'third' }, { num: 1, text: ' first\r\nline ' }] });
    await expect(extractPdfDocumentPages(new Uint8Array([1]))).resolves.toEqual([
      { pdfPageNumber: 1, text: 'first\nline' },
      { pdfPageNumber: 2, text: '' },
      { pdfPageNumber: 3, text: 'third' },
    ]);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects empty bytes before creating a parser', async () => {
    await expect(extractPdfDocumentText(new Uint8Array())).rejects.toMatchObject({ code: 'EMPTY_CONTENT' });
    expect(parserConstructor).not.toHaveBeenCalled();
  });

  it.each([10 * 1024 * 1024, Math.round(50.8 * 1024 * 1024), MAX_PDF_DOCUMENT_BYTES])
    ('accepts a PDF reporting %i bytes', async (size) => {
    getText.mockResolvedValue({ pages: [{ num: 1, text: 'PDF text' }] });
    await expect(extractPdfDocumentText(bytesWithReportedLength(size))).resolves.toBe('PDF text');
    expect(parserConstructor).toHaveBeenCalledTimes(1);
  });

  it('rejects PDF bytes over 64 MiB before creating a parser', async () => {
    await expect(extractPdfDocumentText(bytesWithReportedLength(MAX_PDF_DOCUMENT_BYTES + 1))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(parserConstructor).not.toHaveBeenCalled();
  });

  it('honors an explicit PDF_MAX_BYTES override', async () => {
    const previous = process.env.PDF_MAX_BYTES;
    process.env.PDF_MAX_BYTES = String(20 * 1024 * 1024);
    try {
      await expect(extractPdfDocumentText(bytesWithReportedLength(20 * 1024 * 1024 + 1)))
        .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    } finally {
      if (previous === undefined) delete process.env.PDF_MAX_BYTES;
      else process.env.PDF_MAX_BYTES = previous;
    }
  });

  it('rejects a PDF without extractable text and releases the parser', async () => {
    getText.mockResolvedValue({ pages: [{ num: 1, text: '\n  ' }], text: '' });
    await expect(extractPdfDocumentText(new Uint8Array([1]))).rejects.toEqual(
      new DocumentContentError('EMPTY_CONTENT', 'PDF 文件没有可提取的文本'),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('maps parsing failures to INVALID_PDF and releases the parser', async () => {
    getText.mockRejectedValue(new Error('Invalid PDF structure'));
    await expect(extractPdfDocumentText(new Uint8Array([1]))).rejects.toMatchObject({ code: 'INVALID_PDF' });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
