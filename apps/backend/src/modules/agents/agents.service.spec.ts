import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AgentsService } from './agents.service';

function createService(prisma: Record<string, unknown>) {
  return new AgentsService(prisma as never, {} as never, {} as never);
}

const publishedConfig = {
  id: 'agent-1',
  revision: 3,
  name: 'Published Agent',
  systemPrompt: 'Published prompt',
  model: 'deepseek-chat',
  temperature: 0.3,
  maxTokens: 1024,
  knowledgeBaseIds: ['kb-1'],
  pluginIds: ['plugin_echo'],
};

describe('AgentsService.getPublicAgent', () => {
  it('returns owner and an ACTIVE Agent config from its current snapshot', async () => {
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'agent-1',
          ownerId: 'user-1',
          status: 'ACTIVE',
          currentVersionId: 'version-1',
        }),
      },
      agentVersion: {
        findUnique: jest.fn().mockResolvedValue({
          agentId: 'agent-1',
          version: 3,
          snapshot: publishedConfig,
        }),
      },
    };

    await expect(createService(prisma).getPublicAgent('agent-1')).resolves.toEqual({
      agentId: 'agent-1',
      ownerId: 'user-1',
      status: 'ACTIVE',
      config: publishedConfig,
    });
  });

  it('rejects a DRAFT Agent', async () => {
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'agent-1',
          ownerId: 'user-1',
          status: 'DRAFT',
          currentVersionId: null,
        }),
      },
    };

    await expect(createService(prisma).getPublicAgent('agent-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an ARCHIVED Agent', async () => {
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'agent-1',
          ownerId: 'user-1',
          status: 'ARCHIVED',
          currentVersionId: 'version-1',
        }),
      },
    };

    await expect(createService(prisma).getPublicAgent('agent-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a missing Agent', async () => {
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(createService(prisma).getPublicAgent('missing'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an ACTIVE Agent without a current published version', async () => {
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'agent-1',
          ownerId: 'user-1',
          status: 'ACTIVE',
          currentVersionId: null,
        }),
      },
    };

    await expect(createService(prisma).getPublicAgent('agent-1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a version that does not belong to the Agent', async () => {
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'agent-1',
          ownerId: 'user-1',
          status: 'ACTIVE',
          currentVersionId: 'version-1',
        }),
      },
      agentVersion: {
        findUnique: jest.fn().mockResolvedValue({
          agentId: 'another-agent',
          version: 3,
          snapshot: publishedConfig,
        }),
      },
    };

    await expect(createService(prisma).getPublicAgent('agent-1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
