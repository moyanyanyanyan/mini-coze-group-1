import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAgentsQueryDto } from './dto/list-agents.query.dto';
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

it('列表查询把页码转为数字，并在分页前按用户、状态及关键词搜索', async () => {
  const query = plainToInstance(ListAgentsQueryDto, { page: '2', keyword: 'Agent', status: 'ACTIVE' });
  expect(await validate(query)).toEqual([]);
  const agent = { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(21) };
  const page = await createService({ agent }).list(query, { id: 'owner' });
  const where = { ownerId: 'owner', status: 'ACTIVE', OR: [
    { name: { contains: 'Agent', mode: 'insensitive' } },
    { description: { contains: 'Agent', mode: 'insensitive' } },
  ] };
  expect(agent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 20, take: 20 }));
  expect(agent.count).toHaveBeenCalledWith({ where });
  expect(page).toMatchObject({ page: 2, total: 21 });
});
