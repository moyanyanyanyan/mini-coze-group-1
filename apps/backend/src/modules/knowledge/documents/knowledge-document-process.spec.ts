import { KnowledgeDocumentService } from './knowledge-document.service';
import { DocumentContentError, MAX_DOCUMENT_BYTES, MAX_PDF_DOCUMENT_BYTES } from './document-content';
import { extractPdfDocumentText } from './pdf-document-content';

jest.mock('./pdf-document-content', () => ({ extractPdfDocumentText: jest.fn() }));

const pdfExtractor = jest.mocked(extractPdfDocumentText);

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
  const service = new KnowledgeDocumentService(prisma as never, embedding as never);
  return { service, prisma, embedding, tx, updates };
}

async function process(service: KnowledgeDocumentService) {
  await (service as unknown as { process(id: string): Promise<void> }).process('doc');
}

beforeEach(() => jest.clearAllMocks());

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
    const bytes = Buffer.alloc(limit);
    await expect(service.createFile('kb', 'ws', undefined, { originalname: filename, buffer: bytes, size: bytes.length }))
      .resolves.toMatchObject({ sourceType });
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    const oversized = Buffer.alloc(limit + 1);
    await expect(service.createFile('kb', 'ws', undefined, { originalname: filename, buffer: oversized, size: oversized.length }))
      .rejects.toThrow(/不能超过/);
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
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
    let resolveText!: (text: string) => void;
    pdfExtractor.mockImplementation(() => new Promise<string>((resolve) => { resolveText = resolve; }));
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const { service, prisma, embedding, tx, updates } = setup('PDF', bytes);

    const pending = process(service);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(pdfExtractor).toHaveBeenCalledWith(bytes);
    expect(updates).toEqual([{ stage: 'EXTRACTING' }]);
    expect(embedding.embed).not.toHaveBeenCalled();

    resolveText('PDF extracted content');
    await pending;
    expect(updates).toContainEqual({ rawText: 'PDF extracted content', stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith(['PDF extracted content']);
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

  it.each([
    ['TXT', 'first\r\nsecond', 'first\nsecond'],
    ['JSON', '{"key":"value"}', 'key: value'],
  ] as const)('keeps the %s extraction and chunk path', async (sourceType, input, expected) => {
    const { service, updates, embedding, tx } = setup(sourceType, Buffer.from(input));
    await process(service);

    expect(pdfExtractor).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ rawText: expected, stage: 'CHUNKING' });
    expect(embedding.embed).toHaveBeenCalledWith([expected]);
    expect(tx.knowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) }));
  });
});
