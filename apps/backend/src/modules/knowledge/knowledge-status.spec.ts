import { NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

describe('Knowledge base status changes', () => {
  it('scopes the update to the requested workspace and returns the new status', async () => {
    const updated = { id: 'kb-1', workspaceId: 'ws-1', status: 'DISABLED' };
    const prisma = { knowledgeBase: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
    } };
    const service = new KnowledgeService(prisma as never);

    await expect(service.updateStatus('kb-1', 'ws-1', 'DISABLED')).resolves.toEqual(updated);
    expect(prisma.knowledgeBase.updateMany).toHaveBeenCalledWith({
      where: { id: 'kb-1', workspaceId: 'ws-1' }, data: { status: 'DISABLED' },
    });
  });

  it('does not return a knowledge base when the workspace does not match', async () => {
    const prisma = { knowledgeBase: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: jest.fn(),
    } };
    const service = new KnowledgeService(prisma as never);

    await expect(service.updateStatus('kb-1', 'ws-other', 'ACTIVE')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.knowledgeBase.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
