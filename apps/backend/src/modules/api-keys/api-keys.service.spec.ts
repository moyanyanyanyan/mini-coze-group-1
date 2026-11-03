import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiKeysService } from './api-keys.service';

const SECRET = `mk_live_${'a'.repeat(43)}`;

function createService() {
  const prisma = {
    apiKey: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const agents = { findOne: jest.fn() };
  return {
    service: new ApiKeysService(prisma as never, agents as never),
    prisma,
  };
}

describe('ApiKeysService authentication', () => {
  it('authenticates an active agent key and updates lastUsedAt', async () => {
    const { service, prisma } = createService();
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      revokedAt: null,
      agent: { id: 'agent-1', ownerId: 'user-1', status: 'ACTIVE' },
    });
    prisma.apiKey.update.mockResolvedValue({});

    await expect(service.authenticate(SECRET)).resolves.toEqual({
      userId: 'user-1',
      agentId: 'agent-1',
      apiKeyId: 'key-1',
    });
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: {
        keyHash: createHash('sha256').update(SECRET, 'utf8').digest('hex'),
      },
      include: {
        agent: {
          select: { id: true, ownerId: true, status: true },
        },
      },
    });
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects malformed keys without querying the database', async () => {
    const { service, prisma } = createService();

    await expect(service.authenticate('not-a-key')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['revoked', { id: 'key-1', revokedAt: new Date(), agent: { id: 'agent-1', ownerId: 'user-1', status: 'ACTIVE' } }],
    ['draft agent', { id: 'key-1', revokedAt: null, agent: { id: 'agent-1', ownerId: 'user-1', status: 'DRAFT' } }],
    ['archived agent', { id: 'key-1', revokedAt: null, agent: { id: 'agent-1', ownerId: 'user-1', status: 'ARCHIVED' } }],
  ])('rejects a %s key without updating usage', async (_case, record) => {
    const { service, prisma } = createService();
    prisma.apiKey.findUnique.mockResolvedValue(record);

    await expect(service.authenticate(SECRET)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});

describe('ApiKeysService archived agent management', () => {
  it('keeps archived agent keys visible in the management list', async () => {
    const { service, prisma } = createService();
    prisma.apiKey.findMany.mockResolvedValue([]);

    await service.list('user-1');

    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        revokedAt: null,
        agent: { ownerId: 'user-1' },
      },
    }));
  });

  it('allows an archived agent key to be renamed', async () => {
    const { service, prisma } = createService();
    const apiKey = {
      id: 'key-1',
      agentId: 'agent-1',
      createdById: 'user-1',
      name: '新名称',
      keyPrefix: 'mk_live_abcd',
      keyHash: 'hash',
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
      agent: { id: 'agent-1', name: '已归档 Agent' },
    };
    prisma.apiKey.findFirst.mockResolvedValue(apiKey);
    prisma.apiKey.update.mockResolvedValue(apiKey);

    await expect(service.rename('key-1', '新名称', 'user-1')).resolves.toEqual(expect.objectContaining({
      id: 'key-1',
      name: '新名称',
    }));
    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'key-1',
        revokedAt: null,
        agent: { ownerId: 'user-1' },
      },
    }));
  });
});
