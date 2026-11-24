import { KnowledgeDocumentService } from './knowledge-document.service';
import { DocumentContentError, MAX_DOCUMENT_BYTES, MAX_PDF_DOCUMENT_BYTES } from './document-content';
import { extractPdfDocumentPages } from './pdf-document-content';
import { OcrWorkerError } from '../../../integrations/ocr-worker.client';

jest.mock('./pdf-document-content', () => ({ extractPdfDocumentPages: jest.fn() }));

const pdfExtractor = jest.mocked(extractPdfDocumentPages);

function pages(...texts: string[]) {
  return texts.map((text, index) => ({ pdfPageNumber: index + 1, text }));
}

function ocrPage(pageNumber: number, text: string) {
  return { pageNumber, text, method: 'ocr' as const, regions: [], elapsedMs: 1, renderDpi: 200, width: 100, height: 100 };
}

function setup(sourceType: 'PDF' | 'TXT' | 'JSON', sourceBytes: Uint8Array) {
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    knowledgeChunk: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    knowledgeDocument: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    knowledgeBase: { findUnique: jest.fn().mockResolvedValue({ id: 'kb', workspaceId: 'ws', status: 'ACTIVE' }) },
    knowledgeDocument: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'doc', knowledgeBaseId: 'kb', sourceType, sourceBytes }),
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
  const ocr = { recognizePdfPages: jest.fn() };
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
