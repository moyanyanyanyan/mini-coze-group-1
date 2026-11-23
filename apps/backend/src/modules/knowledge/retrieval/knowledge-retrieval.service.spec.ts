import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { EmbeddingUnavailableError } from '../../../integrations/embedding.client';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

function createService() {
  const prisma = {
    knowledgeBase: { findMany: jest.fn() },
    knowledgeChunk: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const embedding = { embed: jest.fn() };
  return { service: new KnowledgeRetrievalService(prisma as never, embedding as never), prisma, embedding };
}

describe('KnowledgeRetrievalService', () => {
  it('returns NO_HIT for an authorized empty knowledge base without calling Embedding', async () => {
    const { service, prisma, embedding } = createService();
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: 'kb-1', workspaceId: 'ws-1' }]);
    prisma.knowledgeChunk.findFirst.mockResolvedValue(null);

    await expect(service.searchAuthorized(['kb-1'], '报销标准', 5)).resolves.toEqual({ status: 'NO_HIT', hits: [] });
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it('retrieves up to five hits per KB and merges by descending score', async () => {
    const { service, prisma, embedding } = createService();
    prisma.knowledgeBase.findMany.mockResolvedValue([
      { id: 'kb-1', workspaceId: 'ws-1' }, { id: 'kb-2', workspaceId: 'ws-1' },
    ]);
    prisma.knowledgeChunk.findFirst.mockResolvedValueOnce({ id: 'chunk-1' }).mockResolvedValueOnce(null);
    embedding.embed.mockResolvedValue({ model: 'model@revision', vectors: [Array(512).fill(0.01)] });
    const first = { chunkId: 'chunk-1', knowledgeBaseId: 'kb-1', documentId: 'doc-1', documentTitle: 'A', content: 'A', score: 0.7 };
    const second = { chunkId: 'chunk-2', knowledgeBaseId: 'kb-2', documentId: 'doc-2', documentTitle: 'B', content: 'B', score: 0.9 };
    prisma.$queryRaw.mockResolvedValueOnce([first]).mockResolvedValueOnce([second]);

    await expect(service.searchAuthorized(['kb-1', 'kb-2'], '报销标准', 5)).resolves.toEqual({ status: 'HIT', hits: [second, first] });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it.each([601, 8000])('长问题的全部 %i 个字符都参与检索', async (length) => {
    const { service, prisma, embedding } = createService();
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: 'kb', workspaceId: 'ws' }]);
    prisma.knowledgeChunk.findFirst.mockResolvedValueOnce({ id: 'chunk' }).mockResolvedValueOnce(null);
    const query = '问'.repeat(length - 1) + '😀';
    embedding.embed.mockImplementation(async (parts: string[]) => {
      expect(parts.join('')).toBe(query);
      expect(parts.every((part) => Array.from(part).length <= 600)).toBe(true);
      return { model: 'test', vectors: parts.map((_, index) => [index + 1, 1]) };
    });
    prisma.$queryRaw.mockResolvedValue([]);
    await service.searchAuthorized(['kb'], query);
    expect(embedding.embed).toHaveBeenCalledTimes(1);
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toContain('[1,1]');
    expect(sql.values).toContain(`[${Math.ceil(length / 600)},1]`);
  });

  it.each(['   ', '问'.repeat(8001)])('非法检索问题返回 400', async (query) => {
    const { service, embedding } = createService();
    await expect(service.searchAuthorized(['kb'], query)).rejects.toBeInstanceOf(BadRequestException);
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it('rejects cross-workspace KBs and does not embed the query', async () => {
    const { service, prisma, embedding } = createService();
    prisma.knowledgeBase.findMany.mockResolvedValue([
      { id: 'kb-1', workspaceId: 'ws-1' }, { id: 'kb-2', workspaceId: 'ws-2' },
    ]);
    await expect(service.searchAuthorized(['kb-1', 'kb-2'], '问题', 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it('reports embedding failure as a service failure, not NO_HIT', async () => {
    const { service, prisma, embedding } = createService();
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: 'kb-1', workspaceId: 'ws-1' }]);
    prisma.knowledgeChunk.findFirst.mockResolvedValue({ id: 'chunk-1' });
    embedding.embed.mockRejectedValue(new EmbeddingUnavailableError());
    await expect(service.searchAuthorized(['kb-1'], '问题', 5)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not silently treat old-model vectors as NO_HIT', async () => {
    const { service, prisma, embedding } = createService();
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: 'kb-1', workspaceId: 'ws-1' }]);
    prisma.knowledgeChunk.findFirst.mockResolvedValueOnce({ id: 'chunk-1' }).mockResolvedValueOnce({ id: 'old-chunk' });
    embedding.embed.mockResolvedValue({ model: 'new-model@revision', vectors: [Array(512).fill(0.01)] });
    await expect(service.searchAuthorized(['kb-1'], '问题', 5)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
