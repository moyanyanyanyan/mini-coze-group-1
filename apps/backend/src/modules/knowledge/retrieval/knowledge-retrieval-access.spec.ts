import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { KnowledgeRetrievalAccess } from './knowledge-retrieval-access';

function setup() {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    agent: { findUnique: jest.fn().mockResolvedValue({
      ownerId: 'user-1', status: 'DRAFT',
      knowledgeBaseBindings: [
        { knowledgeBaseId: 'kb-active', enabled: true },
        { knowledgeBaseId: 'kb-disabled', enabled: true },
      ],
    }) },
    knowledgeBase: { findMany: jest.fn().mockResolvedValue([
      { id: 'kb-active', status: 'ACTIVE', workspaceId: 'user-1' },
      { id: 'kb-disabled', status: 'DISABLED', workspaceId: 'user-1' },
    ]) },
  };
  return { access: new KnowledgeRetrievalAccess(prisma as never), prisma };
}

describe('KnowledgeRetrievalAccess', () => {
  it('rejects an unknown actor before searching', async () => {
    const { access, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(access.allowedIds('missing', 'agent-1', ['kb-active'])).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.knowledgeBase.findMany).not.toHaveBeenCalled();
  });

  it('rejects an ID that the Agent never bound', async () => {
    const { access, prisma } = setup();
    await expect(access.allowedIds('user-1', 'agent-1', ['kb-other'])).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.knowledgeBase.findMany).not.toHaveBeenCalled();
  });

  it('skips a disabled KB while preserving the active one', async () => {
    const { access } = setup();
    await expect(access.allowedIds('user-1', 'agent-1', ['kb-active', 'kb-disabled'])).resolves.toEqual(['kb-active']);
  });

  it('skips KBs belonging to another personal workspace', async () => {
    const { access, prisma } = setup();
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: 'kb-active', status: 'ACTIVE', workspaceId: 'user-2' }]);
    await expect(access.allowedIds('user-1', 'agent-1', ['kb-active'])).resolves.toEqual([]);
  });
});
