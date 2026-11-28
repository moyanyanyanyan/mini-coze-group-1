import { HttpException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AgentsService } from '../agents/agents.service';
import { ConversationsService } from './conversations.service';

const row = {
  id: 'conversation-1', userId: 'user-1', agentId: 'agent-1', title: '新对话',
  createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

it('persists the selected agentId and returns it in conversation summaries', async () => {
  const create = jest.fn().mockResolvedValue(row);
  const prisma = { conversation: { create } } as unknown as PrismaService;
  const getAgentConfig = jest.fn().mockResolvedValue({});
  const agents = { getAgentConfig } as unknown as AgentsService;
  const service = new ConversationsService(prisma, agents);

  const created = await service.create('user-1', 'agent-1');
  expect(getAgentConfig).toHaveBeenCalledWith('agent-1', 'user-1');
  expect(create).toHaveBeenCalledWith({ data: { userId: 'user-1', agentId: 'agent-1' } });
  expect(created.agentId).toBe('agent-1');
});

it('renames only a conversation owned by the current user', async () => {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findFirst = jest.fn().mockResolvedValue({ ...row, title: '新名称' });
  const prisma = { conversation: { updateMany, findFirst } } as unknown as PrismaService;
  const service = new ConversationsService(prisma, {} as AgentsService);

  const renamed = await service.rename('conversation-1', 'user-1', ' 新名称 ');
  expect(updateMany).toHaveBeenCalledWith({ where: { id: 'conversation-1', userId: 'user-1' }, data: { title: '新名称' } });
  expect(renamed.title).toBe('新名称');
  expect(renamed.agentId).toBe('agent-1');

  updateMany.mockResolvedValue({ count: 0 });
  await expect(service.rename('conversation-1', 'other-user', '错误名称')).rejects.toBeInstanceOf(HttpException);
});
