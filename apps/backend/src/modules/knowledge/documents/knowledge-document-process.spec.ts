import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KnowledgeDocumentService } from './knowledge-document.service';
import { DocumentContentError, MAX_DOCUMENT_BYTES, MAX_PDF_DOCUMENT_BYTES } from './document-content';
import { extractPdfDocumentPages } from './pdf-document-content';
import { OcrWorkerError } from '../../../integrations/ocr-worker.client';
import { imageMaxBytes, officeMaxBytes } from '../../../config/upload-limits';

jest.mock('./pdf-document-content', () => ({ extractPdfDocumentPages: jest.fn() }));

const pdfExtractor = jest.mocked(extractPdfDocumentPages);

function pages(...texts: string[]) {
  return texts.map((text, index) => ({ pdfPageNumber: index + 1, text }));
}

function ocrPage(pageNumber: number, text: string) {
  return { pageNumber, text, method: 'ocr' as const, regions: [], elapsedMs: 1, renderDpi: 200, width: 100, height: 100 };
}

function setup(sourceType: 'PDF' | 'TXT' | 'JSON' | 'TEXT' | 'IMAGE' | 'DOCX' | 'PPTX', sourceBytes: Uint8Array, originalFileName: string | null = null) {
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    knowledgeChunk: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    knowledgeDocument: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    knowledgeBase: { findUnique: jest.fn().mockResolvedValue({ id: 'kb', workspaceId: 'ws', status: 'ACTIVE' }) },
    knowledgeDocument: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'doc', knowledgeBaseId: 'kb', sourceType, sourceBytes, originalFileName }),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return {};
      }),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'doc', knowledgeBaseId: 'kb', ...data, originalFileName: data.originalFileName ?? null,
        status: 'PROCESSING', stage: 'VALIDATING', errorCode: null, errorMessage: null,
        chunkCount: 0, createdAt: new Date(), updatedAt: new Date(),
      })),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  };
  const embedding = { embed: jest.fn().mockImplementation(async (contents: string[]) => ({
    model: 'test-model', vectors: contents.map(() => [0.1]),
  })) };
  const ocr = { recognizePdfPages: jest.fn(), recognizeImage: jest.fn() };
  const service = new KnowledgeDocumentService(prisma as never, embedding as never, ocr as never);
  return { service, prisma, embedding, ocr, tx, updates };
}

async function process(service: KnowledgeDocumentService) {
  await (service as unknown as { process(id: string): Promise<void> }).process('doc');
}

beforeEach(() => {
  jest.clearAllMocks();
  pdfExtractor.mockReset();
});

describe('KnowledgeDocumentService PDF integration', () => {
  it.each([
    ['PDF', MAX_PDF_DOCUMENT_BYTES],
    ['TXT', MAX_DOCUMENT_BYTES],
    ['JSON', MAX_DOCUMENT_BYTES],
  ] as const)('enforces the %s upload boundary before saving', async (sourceType, limit) => {
    const { service, prisma } = setup(sourceType, new Uint8Array());
    const schedule = jest.fn();
    (service as unknown as { schedule(id: string): void }).schedule = schedule;
    const filename = `upload.${sourceType.toLowerCase()}`;
    // Mock the advertised Multer size; no need to allocate a 64 MiB PDF in a unit test.
    const bytes = Buffer.alloc(sourceType === 'PDF' ? 4 : limit);
    await expect(service.createFile('kb', 'ws', undefined, { originalname: filename, buffer: bytes, size: limit }))
      .resolves.toMatchObject({ sourceType });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    const oversized = Buffer.alloc(sourceType === 'PDF' ? 4 : limit + 1);
    const rejected = service.createFile('kb', 'ws', undefined, { originalname: filename, buffer: oversized, size: limit + 1 });
    if (sourceType === 'PDF') await expect(rejected).rejects.toMatchObject({ status: 413 });
    else await expect(rejected).rejects.toThrow(/不能超过/);
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it.each([10 * 1024 * 1024, Math.round(50.8 * 1024 * 1024), MAX_PDF_DOCUMENT_BYTES])
    ('accepts a PDF at %i bytes through Service size validation', async (size) => {
      const { service, prisma } = setup('PDF', new Uint8Array());
      (service as unknown as { schedule(id: string): void }).schedule = jest.fn();
      await expect(service.createFile('kb', 'ws', undefined, {
        originalname: 'test.pdf', buffer: Buffer.from('%PDF'), size,
      })).resolves.toMatchObject({ sourceType: 'PDF' });
      expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    });

  it('keeps pasted text at 1 MiB', async () => {
    const { service, prisma } = setup('TXT', new Uint8Array());
    const schedule = jest.fn();
    (service as unknown as { schedule(id: string): void }).schedule = schedule;
    await expect(service.createText('kb', { workspaceId: 'ws', title: 'pasted', text: 'a'.repeat(MAX_DOCUMENT_BYTES) }))
      .resolves.toMatchObject({ sourceType: 'TEXT' });
    await expect(service.createText('kb', { workspaceId: 'ws', title: 'pasted', text: 'a'.repeat(MAX_DOCUMENT_BYTES + 1) }))
      .rejects.toThrow(/不能超过/);
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });
  it('accepts a PDF upload, saves its original bytes and schedules processing', async () => {
    const bytes = Buffer.from('%PDF');
    const { service, prisma } = setup('PDF', bytes);
    const schedule = jest.fn();
    (service as unknown as { schedule(id: string): void }).schedule = schedule;

    const result = await service.createFile('kb', 'ws', undefined, { originalname: 'manual.PDF', buffer: bytes, size: bytes.length });

    expect(result).toMatchObject({ sourceType: 'PDF', status: 'PROCESSING' });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledWith({ data: {
      knowledgeBaseId: 'kb', title: 'manual', sourceType: 'PDF',
      originalFileName: 'manual.PDF', sourceBytes: new Uint8Array(bytes),
    } });
    expect(schedule).toHaveBeenCalledWith('doc');
  });

  it('awaits PDF extraction before saving rawText and chunking it', async () => {
    let resolveText!: (value: ReturnType<typeof pages>) => void;
    pdfExtractor.mockImplementation(() => new Promise((resolve) => { resolveText = resolve; }));
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const { service, prisma, embedding, ocr, tx, updates } = setup('PDF', bytes);

    const pending = process(service);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(pdfExtractor).toHaveBeenCalledWith(bytes);
    expect(updates).toEqual([{ stage: 'EXTRACTING' }]);
    expect(embedding.embed).not.toHaveBeenCalled();

    resolveText(pages('PDF extracted content'));
    await pending;
    expect(updates).toContainEqual({ rawText: 'PDF extracted content', stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith(['PDF extracted content']);
    expect(ocr.recognizePdfPages).not.toHaveBeenCalled();
    expect(tx.knowledgeChunk.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ content: 'PDF extracted content' })] });
    expect(tx.knowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY', stage: 'COMPLETED' }) }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('records INVALID_PDF as a content failure before embedding', async () => {
    pdfExtractor.mockRejectedValue(new DocumentContentError('INVALID_PDF', 'PDF 文件无法解析'));
    const { service, embedding, prisma, updates } = setup('PDF', new Uint8Array([1]));

    await process(service);

    expect(updates).toContainEqual({ status: 'FAILED', stage: 'FAILED', errorCode: 'INVALID_PDF', errorMessage: 'PDF 文件无法解析' });
    expect(updates).not.toContainEqual(expect.objectContaining({ stage: 'CHUNKING' }));
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('OCRs an empty scan and passes its text through Chunk, Embedding and the transaction', async () => {
    pdfExtractor.mockResolvedValue(pages(''));
    const bytes = Buffer.from('%PDF-1.7');
    const { service, ocr, embedding, tx, updates } = setup('PDF', bytes);
    ocr.recognizePdfPages.mockResolvedValue({ status: 'ok', pages: [ocrPage(1, 'scanned body')] });

    await process(service);

    expect(ocr.recognizePdfPages).toHaveBeenCalledWith(bytes, 'document.pdf', [1], 200);
    expect(updates).toContainEqual({ rawText: 'scanned body', stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith(['scanned body']);
    expect(tx.knowledgeChunk.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ content: 'scanned body' })] });
    expect(tx.knowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) }));
  });

  it('waits for OCR before saving rawText or starting Embedding', async () => {
    pdfExtractor.mockResolvedValue(pages(''));
    const { service, ocr, embedding, updates } = setup('PDF', Buffer.from('%PDF'));
    let finishOcr!: (response: { status: 'ok'; pages: ReturnType<typeof ocrPage>[] }) => void;
    ocr.recognizePdfPages.mockImplementation(() => new Promise((resolve) => { finishOcr = resolve; }));

    const pending = process(service);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(ocr.recognizePdfPages).toHaveBeenCalledTimes(1);
    expect(updates).toEqual([{ stage: 'EXTRACTING' }]);
    expect(embedding.embed).not.toHaveBeenCalled();

    finishOcr({ status: 'ok', pages: [ocrPage(1, 'awaited text')] });
    await pending;
    expect(updates).toContainEqual({ rawText: 'awaited text', stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith(['awaited text']);
  });

  it('OCRs pages consisting only of repeated headers, footers and page numbers', async () => {
    pdfExtractor.mockResolvedValue(pages('Course title\nFooter\n第 1 页', 'Course title\nFooter\n第 2 页'));
    const { service, ocr, updates } = setup('PDF', Buffer.from('%PDF'));
    ocr.recognizePdfPages.mockResolvedValue({ status: 'ok', pages: [ocrPage(1, 'first body'), ocrPage(2, 'second body')] });

    await process(service);

    expect(ocr.recognizePdfPages).toHaveBeenCalledWith(expect.any(Buffer), 'document.pdf', [1, 2], 200);
    expect(updates).toContainEqual({ rawText: 'first body\n\nsecond body', stage: 'CHUNKING' });
  });

  it('selects only scanned pages in a mixed PDF, preserving PDF order without duplicating native and OCR text', async () => {
    pdfExtractor.mockResolvedValue(pages('native first', '2', 'native third'));
    const { service, ocr, embedding, updates } = setup('PDF', Buffer.from('%PDF'));
    ocr.recognizePdfPages.mockResolvedValue({ status: 'ok', pages: [ocrPage(2, 'OCR second')] });

    await process(service);

    expect(ocr.recognizePdfPages).toHaveBeenCalledTimes(1);
    expect(ocr.recognizePdfPages).toHaveBeenCalledWith(expect.any(Buffer), 'document.pdf', [2], 200);
    const rawText = 'native first\n\nOCR second\n\nnative third';
    expect(updates).toContainEqual({ rawText, stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith([rawText]);
    expect(rawText).not.toContain('\n\n2\n\n');
  });

  it('rejects Worker page mismatches before persisting rawText or embedding', async () => {
    pdfExtractor.mockResolvedValue(pages('native', ''));
    const { service, ocr, embedding, updates } = setup('PDF', Buffer.from('%PDF'));
    ocr.recognizePdfPages.mockResolvedValue({ status: 'ok', pages: [ocrPage(1, 'wrong page')] });

    await process(service);

    expect(updates).toContainEqual(expect.objectContaining({ status: 'FAILED', stage: 'FAILED', errorCode: 'OCR_INVALID_RESPONSE' }));
    expect(updates).not.toContainEqual(expect.objectContaining({ stage: 'CHUNKING' }));
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'WORKER_AUTH_FAILED'], [403, 'WORKER_AUTH_FAILED'], [413, 'FILE_TOO_LARGE'],
    [429, 'WORKER_BUSY'], [500, 'WORKER_FAILED'],
  ] as const)('records Worker HTTP %i as a distinct OCR failure', async (status, code) => {
    pdfExtractor.mockResolvedValue(pages(''));
    const { service, ocr, embedding, prisma, updates } = setup('PDF', Buffer.from('%PDF'));
    ocr.recognizePdfPages.mockRejectedValue(new OcrWorkerError(code, 'OCR request failed', status));

    await process(service);

    expect(updates).toContainEqual({ status: 'FAILED', stage: 'FAILED', errorCode: `OCR_${code}`, errorMessage: 'OCR request failed' });
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks an unavailable Worker FAILED instead of silently accepting a partial native PDF', async () => {
    pdfExtractor.mockResolvedValue(pages('native first', ''));
    const { service, ocr, embedding, updates } = setup('PDF', Buffer.from('%PDF'));
    ocr.recognizePdfPages.mockRejectedValue(new OcrWorkerError('UNAVAILABLE', 'OCR Worker 无法连接'));

    await process(service);

    expect(updates).toContainEqual({ status: 'FAILED', stage: 'FAILED', errorCode: 'OCR_UNAVAILABLE', errorMessage: 'OCR Worker 无法连接' });
    expect(updates).not.toContainEqual(expect.objectContaining({ stage: 'CHUNKING' }));
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it.each([
    ['TXT', 'first\r\nsecond', 'first\nsecond'],
    ['JSON', '{"key":"value"}', 'key: value'],
  ] as const)('keeps the %s extraction and chunk path', async (sourceType, input, expected) => {
    const { service, updates, embedding, ocr, tx } = setup(sourceType, Buffer.from(input));
    await process(service);

    expect(pdfExtractor).not.toHaveBeenCalled();
    expect(ocr.recognizePdfPages).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ rawText: expected, stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith([expected]);
    expect(tx.knowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) }));
  });
});

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);

function imageOcrPage(text: string) {
  return {
    pageNumber: 1, method: 'ocr' as const, text, regions: [], elapsedMs: 1,
    renderDpi: null, width: null, height: null,
  };
}

describe('KnowledgeDocumentService image integration', () => {
  it.each([
    ['scan.png', 'image/png', PNG_BYTES],
    ['photo.jpg', 'image/jpeg', JPEG_BYTES],
    ['photo.JPEG', 'image/jpeg', JPEG_BYTES],
  ] as const)('accepts a %s image upload and schedules processing', async (filename, mimetype, bytes) => {
    const { service, prisma, ocr } = setup('TEXT', new Uint8Array());
    const schedule = jest.fn();
    (service as unknown as { schedule(id: string): void }).schedule = schedule;

    const result = await service.createFile('kb', 'ws', undefined, {
      originalname: filename, buffer: bytes, size: bytes.length, mimetype,
    });

    expect(result).toMatchObject({ sourceType: 'IMAGE', originalFileName: filename, status: 'PROCESSING' });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      knowledgeBaseId: 'kb', sourceType: 'IMAGE', originalFileName: filename, sourceBytes: new Uint8Array(bytes),
    }) });
    expect(schedule).toHaveBeenCalledWith('doc');
    expect(ocr.recognizeImage).not.toHaveBeenCalled();
  });

  it('enforces the OCR Worker image size limit before saving', async () => {
    const { service, prisma } = setup('TEXT', new Uint8Array());
    const schedule = jest.fn();
    (service as unknown as { schedule(id: string): void }).schedule = schedule;

    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'scan.png', buffer: PNG_BYTES, size: imageMaxBytes(), mimetype: 'image/png',
    })).resolves.toMatchObject({ sourceType: 'IMAGE' });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);

    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'scan.png', buffer: PNG_BYTES, size: imageMaxBytes() + 1, mimetype: 'image/png',
    })).rejects.toMatchObject({ status: 413 });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('rejects an extension and MIME mismatch before saving', async () => {
    const { service, prisma } = setup('TEXT', new Uint8Array());
    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'scan.png', buffer: PNG_BYTES, size: PNG_BYTES.length, mimetype: 'image/jpeg',
    })).rejects.toThrow(/MIME 类型不一致/);
    expect(prisma.knowledgeDocument.create).not.toHaveBeenCalled();
  });

  it('rejects a renamed file whose content is not the declared image format', async () => {
    const { service, prisma } = setup('TEXT', new Uint8Array());
    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'scan.png', buffer: JPEG_BYTES, size: JPEG_BYTES.length, mimetype: 'image/png',
    })).rejects.toThrow(/内容与扩展名不一致/);
    expect(prisma.knowledgeDocument.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported image extensions such as .gif', async () => {
    const { service, prisma } = setup('TEXT', new Uint8Array());
    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'animation.gif', buffer: Buffer.from('GIF89a'), size: 6, mimetype: 'image/gif',
    })).rejects.toThrow(/只支持/);
    expect(prisma.knowledgeDocument.create).not.toHaveBeenCalled();
  });

  it('calls recognizeImage and keeps the shared Chunk, Embedding and Vector transaction', async () => {
    const { service, ocr, embedding, tx, updates } = setup('IMAGE', PNG_BYTES, 'scan.png');
    ocr.recognizeImage.mockResolvedValue({ status: 'ok', pages: [imageOcrPage('  发票金额 100 元  ')] });

    await process(service);

    expect(ocr.recognizeImage).toHaveBeenCalledWith(Buffer.from(PNG_BYTES), 'scan.png', 'image/png');
    expect(pdfExtractor).not.toHaveBeenCalled();
    expect(ocr.recognizePdfPages).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ rawText: '发票金额 100 元', stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith(['发票金额 100 元']);
    expect(tx.knowledgeChunk.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ content: '发票金额 100 元' })],
    });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.knowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'READY', stage: 'COMPLETED' }),
    }));
  });

  it.each([
    ['photo.jpg', 'image/jpeg', JPEG_BYTES],
    ['photo.JPEG', 'image/jpeg', JPEG_BYTES],
  ] as const)('uses image/jpeg for %s and normalizes CRLF OCR text', async (filename, mimeType, bytes) => {
    const { service, ocr, updates } = setup('IMAGE', bytes, filename);
    ocr.recognizeImage.mockResolvedValue({ status: 'ok', pages: [imageOcrPage('第一行\r\n第二行')] });

    await process(service);

    expect(ocr.recognizeImage).toHaveBeenCalledWith(Buffer.from(bytes), filename, mimeType);
    expect(updates).toContainEqual({ rawText: '第一行\n第二行', stage: 'CHUNKING' });
  });

  it('fails with EMPTY_CONTENT when OCR succeeds without recognized text', async () => {
    const { service, ocr, embedding, tx, updates } = setup('IMAGE', PNG_BYTES, 'blank.png');
    ocr.recognizeImage.mockResolvedValue({ status: 'ok', pages: [imageOcrPage(' \r\n ')] });

    await process(service);

    expect(updates).toContainEqual({
      status: 'FAILED', stage: 'FAILED', errorCode: 'EMPTY_CONTENT', errorMessage: '图片中没有识别到有效文本',
    });
    expect(updates).not.toContainEqual(expect.objectContaining({ stage: 'CHUNKING' }));
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(tx.knowledgeChunk.createMany).not.toHaveBeenCalled();
    expect(tx.knowledgeDocument.update).not.toHaveBeenCalled();
  });

  it('records OCR Worker unavailability as OCR_UNAVAILABLE', async () => {
    const { service, ocr, embedding, updates } = setup('IMAGE', PNG_BYTES, 'scan.png');
    ocr.recognizeImage.mockRejectedValue(new OcrWorkerError('UNAVAILABLE', 'OCR Worker 无法连接'));

    await process(service);

    expect(updates).toContainEqual({
      status: 'FAILED', stage: 'FAILED', errorCode: 'OCR_UNAVAILABLE', errorMessage: 'OCR Worker 无法连接',
    });
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it('maps OCR Worker authentication failure to OCR_WORKER_AUTH_FAILED', async () => {
    const { service, ocr, updates } = setup('IMAGE', PNG_BYTES, 'scan.png');
    ocr.recognizeImage.mockRejectedValue(new OcrWorkerError('WORKER_AUTH_FAILED', 'OCR Worker 内部认证失败', 401));

    await process(service);

    expect(updates).toContainEqual(expect.objectContaining({
      status: 'FAILED', errorCode: 'OCR_WORKER_AUTH_FAILED', errorMessage: 'OCR Worker 内部认证失败',
    }));
  });

  it('records OCR timeouts as OCR_TIMEOUT', async () => {
    const { service, ocr, embedding, updates } = setup('IMAGE', PNG_BYTES, 'scan.png');
    ocr.recognizeImage.mockRejectedValue(new OcrWorkerError('TIMEOUT', 'OCR Worker 请求超时'));

    await process(service);

    expect(updates).toContainEqual(expect.objectContaining({ status: 'FAILED', errorCode: 'OCR_TIMEOUT' }));
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it('rejects an OCR response with a wrong page number before saving rawText', async () => {
    const { service, ocr, embedding, updates } = setup('IMAGE', PNG_BYTES, 'scan.png');
    ocr.recognizeImage.mockResolvedValue({ status: 'ok', pages: [imageOcrPage('text'), imageOcrPage('extra')] });

    await process(service);

    expect(updates).toContainEqual(expect.objectContaining({ status: 'FAILED', errorCode: 'OCR_INVALID_RESPONSE' }));
    expect(updates).not.toContainEqual(expect.objectContaining({ stage: 'CHUNKING' }));
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it('does not route image documents through the PDF or TXT extractors', async () => {
    const { service, ocr, updates } = setup('IMAGE', PNG_BYTES, 'scan.png');
    ocr.recognizeImage.mockResolvedValue({ status: 'ok', pages: [imageOcrPage('image body')] });

    await process(service);

    expect(pdfExtractor).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ rawText: 'image body', stage: 'CHUNKING' });
  });

  it('does not OCR a TEXT document even when its file name looks like an image', async () => {
    const { service, ocr, embedding, updates } = setup('TEXT', PNG_BYTES, 'scan.png');

    await process(service);

    expect(ocr.recognizeImage).not.toHaveBeenCalled();
    expect(ocr.recognizePdfPages).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: 'FAILED', errorCode: 'INVALID_ENCODING' }));
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['not an image', 'scan.txt'],
  ] as const)('fails an IMAGE document with a %s original file name', async (_label, filename) => {
    const { service, ocr, embedding, updates } = setup('IMAGE', PNG_BYTES, filename);

    await process(service);

    expect(ocr.recognizeImage).not.toHaveBeenCalled();
    expect(updates).toContainEqual({
      status: 'FAILED', stage: 'FAILED', errorCode: 'UNSUPPORTED_FILE', errorMessage: '图片文档缺少有效的原始文件名',
    });
    expect(embedding.embed).not.toHaveBeenCalled();
  });
});

const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

function officeFixture(name: string): Buffer {
  return readFileSync(join(__dirname, '../../../../test/fixtures', name));
}

describe('KnowledgeDocumentService Office integration', () => {
  it.each([
    ['DOCX', 't8.docx'],
    ['PPTX', 't8.pptx'],
  ] as const)('takes a %s upload through extraction, chunking, embedding and READY', async (sourceType, filename) => {
    const bytes = officeFixture(filename);
    const { service, prisma, ocr, embedding, tx, updates } = setup(sourceType, bytes, filename);
    const schedule = jest.fn();
    (service as unknown as { schedule(id: string): void }).schedule = schedule;
    ocr.recognizeImage.mockResolvedValue({
      status: 'ok',
      pages: [imageOcrPage('OFFICE IMAGE TEXT')],
    });

    const created = await service.createFile('kb', 'ws', undefined, {
      originalname: filename, buffer: bytes, size: bytes.length,
      mimetype: sourceType === 'DOCX'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    expect(created).toMatchObject({ sourceType, status: 'PROCESSING' });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType,
        originalFileName: filename,
        sourceBytes: new Uint8Array(bytes),
      }),
    });
    expect(schedule).toHaveBeenCalledWith('doc');

    await process(service);

    const rawText = updates.find((update) => typeof update.rawText === 'string')?.rawText;
    expect(rawText).toContain('OFFICE IMAGE TEXT');
    expect(rawText).toContain(sourceType === 'DOCX' ? 'Alpha paragraph.' : 'T8 Slide One');
    expect(embedding.embed).toHaveBeenCalledTimes(1);
    expect(tx.knowledgeChunk.createMany).toHaveBeenCalledTimes(1);
    expect(tx.knowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'READY', stage: 'COMPLETED' }),
    }));
    expect(ocr.recognizeImage).toHaveBeenCalled();
  });

  it('enforces the 32 MiB Office upload boundary before saving', async () => {
    const { service, prisma } = setup('DOCX', ZIP_HEADER);
    const schedule = jest.fn();
    (service as unknown as { schedule(id: string): void }).schedule = schedule;

    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'manual.docx', buffer: ZIP_HEADER, size: officeMaxBytes(),
    })).resolves.toMatchObject({ sourceType: 'DOCX' });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);

    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'manual.docx', buffer: ZIP_HEADER, size: officeMaxBytes() + 1,
    })).rejects.toMatchObject({ status: 413 });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('rejects a renamed non-ZIP Office file before saving', async () => {
    const { service, prisma } = setup('DOCX', Buffer.from('not a zip'));

    await expect(service.createFile('kb', 'ws', undefined, {
      originalname: 'fake.docx', buffer: Buffer.from('not a zip'), size: 9,
    })).rejects.toThrow(/OOXML/);
    expect(prisma.knowledgeDocument.create).not.toHaveBeenCalled();
  });
});
