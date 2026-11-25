import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OcrWorkerError,
  type OcrWorkerResponse,
} from '../../../integrations/ocr-worker.client';
import { officeMaxBytes } from '../../../config/upload-limits';
import { DocumentContentError } from './document-content';
import {
  extractOfficeDocument,
  extractOfficeDocumentText,
  officeFormatFromFilename,
} from './office-document-content';

function fixture(name: string): Buffer {
  return readFileSync(join(__dirname, '../../../../test/fixtures', name));
}

const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

function ocrPage(text: string) {
  return {
    pageNumber: 1,
    method: 'ocr' as const,
    text,
    regions: [],
    elapsedMs: 1,
    renderDpi: null,
    width: null,
    height: null,
  };
}

function setupOcr(text = 'OCR EMBEDDED IMAGE') {
  const recognizeImage = jest.fn().mockResolvedValue({
    status: 'ok',
    pages: [ocrPage(text)],
  } satisfies OcrWorkerResponse);
  return { recognizeImage };
}

describe('Office document parsing', () => {
  it('maps only DOCX/PPTX extensions to Office formats', () => {
    expect(officeFormatFromFilename('report.DOCX')).toBe('docx');
    expect(officeFormatFromFilename('deck.pptx')).toBe('pptx');
    expect(officeFormatFromFilename('legacy.doc')).toBeNull();
    expect(officeFormatFromFilename('sheet.xlsx')).toBeNull();
  });

  it('parses a DOCX, keeps heading/table order, OCRs its image and ignores headers/footers', async () => {
    const worker = setupOcr('INVOICE TOTAL 42');
    const result = await extractOfficeDocument(
      fixture('t8.docx'),
      't8.docx',
      worker,
    );

    expect(result.document.format).toBe('docx');
    expect(result.document.rawText).toBe(
      'T8 DOCX Heading\n\n' +
        'Alpha paragraph.\n\n' +
        'A1\tB1\nA2\tB2\n\n' +
        'Before image.\n\n' +
        'INVOICE TOTAL 42\n\n' +
        'After image.',
    );
    expect(result.document.rawText).not.toContain('T8 DOCX HEADER');
    expect(result.document.rawText).not.toContain('T8 DOCX FOOTER');
    expect(worker.recognizeImage).toHaveBeenCalledTimes(1);
    expect(worker.recognizeImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image1.png',
      'image/png',
    );

    expect(result.document.sections).toHaveLength(1);
    expect(
      result.document.sections[0].blocks.map((block) => block.kind),
    ).toEqual([
      'paragraph',
      'paragraph',
      'table',
      'paragraph',
      'paragraph',
      'paragraph',
    ]);
    expect(result.document.images).toHaveLength(1);
    expect(result.document.images[0]).toMatchObject({
      attachmentName: 'image1.png',
      attachmentIndex: 0,
      mimeType: 'image/png',
      ocrText: 'INVOICE TOTAL 42',
      source: { path: 'content.4.children.0' },
    });
    expect(result.warnings).toEqual([]);
  });

  it('parses PPTX slides in order, groups text boxes, keeps tables, notes and repeated image OCR', async () => {
    const worker = setupOcr('CHART OCR');
    const result = await extractOfficeDocument(
      fixture('t8.pptx'),
      't8.pptx',
      worker,
    );

    expect(result.document.format).toBe('pptx');
    expect(
      result.document.sections.map((section) => section.slideNumber),
    ).toEqual([1, 2]);
    expect(result.document.rawText).toBe(
      'T8 Slide One\n\n' +
        'Bullet A\nBullet B\n\n' +
        'CHART OCR\n\n' +
        'T8 Slide Two\n\n' +
        'Text box line 1\nText box line 2\n\n' +
        'P1\tP2\nQ1\tQ2\n\n' +
        'CHART OCR',
    );
    expect(result.document.rawText).not.toContain('T8 speaker note');
    expect(result.document.sections[0].notes).toMatchObject([
      { kind: 'paragraph', text: 'T8 speaker note' },
    ]);
    expect(
      result.document.sections[0].blocks.map((block) => block.kind),
    ).toEqual(['textBox', 'textBox', 'image']);
    expect(
      result.document.sections[1].blocks.map((block) => block.kind),
    ).toEqual(['textBox', 'textBox', 'table', 'image']);
    expect(result.document.sections[0].blocks[0]).toMatchObject({
      source: {
        slideNumber: 1,
        bounds: { x: 36, y: 21.63, width: 648, height: 90 },
      },
    });

    // The same media part is used on both slides: OCR runs once and its text appears twice.
    expect(worker.recognizeImage).toHaveBeenCalledTimes(1);
    expect(result.document.images).toHaveLength(2);
    expect(
      result.document.images.every((image) => image.ocrText === 'CHART OCR'),
    ).toBe(true);
    expect(result.document.unplacedAttachmentIndexes).toEqual([]);
  });

  it('returns text without OCR when an Office document has no pictures', async () => {
    const worker = setupOcr();
    const text = await extractOfficeDocumentText(
      fixture('t8-text.docx'),
      't8-text.docx',
      worker,
    );
    expect(text).toBe('Text only body.');
    expect(worker.recognizeImage).not.toHaveBeenCalled();
  });

  it('rejects empty, unsupported, corrupt and mismatched files before OCR', async () => {
    const worker = setupOcr();
    await expect(
      extractOfficeDocument(Buffer.alloc(0), 'empty.docx', worker),
    ).rejects.toMatchObject({ code: 'EMPTY_CONTENT' });
    await expect(
      extractOfficeDocument(Buffer.from('x'), 'legacy.doc', worker),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
    await expect(
      extractOfficeDocument(Buffer.from('not a zip'), 'broken.docx', worker),
    ).rejects.toMatchObject({ code: 'INVALID_OFFICE_DOCUMENT' });
    await expect(
      extractOfficeDocument(fixture('t8.pptx'), 'mismatch.docx', worker),
    ).rejects.toMatchObject({ code: 'INVALID_OFFICE_DOCUMENT' });
    expect(worker.recognizeImage).not.toHaveBeenCalled();
  });

  it('keeps document text when an embedded picture format cannot be OCRed', async () => {
    const worker = setupOcr();
    const result = await extractOfficeDocument(
      fixture('t8-bmp.docx'),
      't8-bmp.docx',
      worker,
    );
    expect(result.document.rawText).toBe('Before BMP.\n\nAfter BMP.');
    expect(worker.recognizeImage).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'IMAGE_OCR_SKIPPED' }),
    ]);
  });

  it('rejects an Office archive over the 32 MiB parser boundary before parsing', async () => {
    const worker = setupOcr();
    const bytes = Buffer.alloc(officeMaxBytes() + 1);
    ZIP_HEADER.copy(bytes);
    await expect(extractOfficeDocument(bytes, 'large.docx', worker))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(worker.recognizeImage).not.toHaveBeenCalled();
  });

  it('propagates OCR worker failures instead of returning partial Office text', async () => {
    const worker = setupOcr();
    worker.recognizeImage.mockRejectedValue(
      new OcrWorkerError('UNAVAILABLE', 'OCR Worker 无法连接'),
    );
    await expect(
      extractOfficeDocument(fixture('t8.docx'), 't8.docx', worker),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('rejects an invalid OCR response before merging image text', async () => {
    const worker = setupOcr();
    worker.recognizeImage.mockResolvedValue({
      status: 'ok',
      pages: [ocrPage('one'), ocrPage('two')],
    });
    await expect(
      extractOfficeDocument(fixture('t8.docx'), 't8.docx', worker),
    ).rejects.toBeInstanceOf(OcrWorkerError);
  });

  it('maps an empty document to EMPTY_CONTENT', async () => {
    const worker = setupOcr();
    await expect(
      extractOfficeDocument(fixture('t8-empty.docx'), 'empty.docx', worker),
    ).rejects.toMatchObject({ code: 'EMPTY_CONTENT' });
    expect(worker.recognizeImage).not.toHaveBeenCalled();
  });
});

describe('Office parsing error contract', () => {
  it('uses DocumentContentError codes the service can persist', async () => {
    const worker = setupOcr();
    try {
      await extractOfficeDocument(Buffer.from('bad'), 'bad.docx', worker);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentContentError);
      expect((error as DocumentContentError).code).toBe(
        'INVALID_OFFICE_DOCUMENT',
      );
    }
  });
});
