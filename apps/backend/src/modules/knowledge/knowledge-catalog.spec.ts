import { KnowledgeService } from './knowledge.service';

describe('Knowledge catalog for Agent bindings', () => {
  it('returns an empty result without querying when no IDs are requested', async () => {
    const prisma = { knowledgeBase: { findMany: jest.fn() } };
    const service = new KnowledgeService(prisma as never);

    await expect(service.findByIds([])).resolves.toEqual([]);
    expect(prisma.knowledgeBase.findMany).not.toHaveBeenCalled();
  });

  it('returns catalog facts for requested IDs, including disabled status and workspace', async () => {
    const catalogs = [
      { id: 'kb-active', name: '产品文档', status: 'ACTIVE', workspaceId: 'ws-1' },
      { id: 'kb-disabled', name: '旧手册', status: 'DISABLED', workspaceId: 'ws-2' },
    ];
    const prisma = { knowledgeBase: { findMany: jest.fn().mockResolvedValue(catalogs) } };
    const service = new KnowledgeService(prisma as never);

    await expect(service.findByIds(['kb-active', 'kb-missing', 'kb-disabled'])).resolves.toEqual(catalogs);
    expect(prisma.knowledgeBase.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['kb-active', 'kb-missing', 'kb-disabled'] } },
      select: { id: true, name: true, status: true, workspaceId: true },
    });
  });
});
