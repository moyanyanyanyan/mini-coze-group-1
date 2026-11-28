import { KnowledgePreviewService } from './knowledge-preview.service';

function createService() {
  const prisma = {
    knowledgeBase: { findUnique: jest.fn().mockResolvedValue({ workspaceId: 'ws', status: 'ACTIVE' }) },
    knowledgeDocument: { findFirst: jest.fn().mockResolvedValue({ id: 'doc' }) },
    knowledgeChunk: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations));
  const retrieval = { searchAuthorized: jest.fn() };
  return {
    service: new KnowledgePreviewService(prisma as never, retrieval as never),
    prisma,
  };
}

describe('KnowledgePreviewService source ranges', () => {
  it('projects sourceRanges and keeps legacy NULL values', async () => {
    const { service, prisma } = createService();
    prisma.knowledgeChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-office', position: 0, content: 'office', startOffset: 0, endOffset: 6,
        enabled: true,
        sourceRanges: {
          version: 1,
          ranges: [{
            path: 'content.0', slideNumber: 2, kind: 'heading',
            startOffset: 0, endOffset: 6, overlap: false, headingLevel: 1,
            unexpected: '<script>',
          }],
          extra: true,
        },
      },
      {
        id: 'chunk-legacy', position: 1, content: 'old', startOffset: 7, endOffset: 10,
        enabled: true, sourceRanges: null,
      },
    ]);

    const result = await service.listChunks('kb', 'doc', 'ws', 1);

    expect(result.items[0].sourceRanges).toEqual({
      version: 1,
      ranges: [{
        path: 'content.0', slideNumber: 2, kind: 'heading',
        startOffset: 0, endOffset: 6, overlap: false, headingLevel: 1,
      }],
    });
    expect(result.items[1].sourceRanges).toBeNull();
    expect(prisma.knowledgeChunk.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ sourceRanges: true }),
    }));
  });

  it('returns null when stored sourceRanges are malformed', async () => {
    const { service, prisma } = createService();
    prisma.knowledgeChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-bad', position: 0, content: 'bad', startOffset: 0, endOffset: 3,
        enabled: true,
        sourceRanges: { version: 99, ranges: [{ path: 'x' }] },
      },
    ]);

    const result = await service.listChunks('kb', 'doc', 'ws', 1);
    expect(result.items[0].sourceRanges).toBeNull();
  });
});
