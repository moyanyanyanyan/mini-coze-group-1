import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
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
