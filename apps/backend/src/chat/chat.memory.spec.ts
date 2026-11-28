import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';

function setup() {
  const prisma = { message: { findMany: jest.fn().mockResolvedValue([]) } };
  const conversations = { assertOwned: jest.fn().mockResolvedValue({ agentId: 'agent' }) };
  const agents = { getAgentConfig: jest.fn().mockResolvedValue({ contextLimit: 20, systemPrompt: '约束', maxTokens: 128 }) };
  const runtime = { previewContext: jest.fn(async (input: { history: unknown[] }) => ({ tokenLimit: 1024,
    estimatedInputTokens: 100, reservedOutputTokens: 128, remainingTokens: 796, droppedTurns: 0, history: input.history })) };
  const service = new ChatService(prisma as never, conversations as never, {} as never, runtime as never, agents as never);
  return { service, prisma, conversations, runtime, agents };
}

it('先校验会话归属，拒绝访问时不读取消息或调用 Runtime', async () => {
  const { service, conversations, prisma, runtime } = setup();
  conversations.assertOwned.mockRejectedValue(new NotFoundException());
  await expect(service.memory('other', 'owner')).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.message.findMany).not.toHaveBeenCalled();
  expect(runtime.previewContext).not.toHaveBeenCalled();
});

it('复用历史窗口和附件正文，显示实际十轮上限，不返回模型凭据', async () => {
  const { service, prisma, runtime } = setup();
  prisma.message.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, index) => [
    { id: `u${index}`, role: 'user', content: `问题${index}`, attachments: index === 11 ? [{ fileName: '说明.md', sourceType: 'MD', status: 'READY', extractedText: '附件正文' }] : [] },
    { id: `a${index}`, role: 'assistant', content: `回答${index}`, attachments: [] },
  ]).flat() as never);
  const result = await service.memory('conversation', 'owner');
  expect(result).toMatchObject({ configuredTurns: 20, effectiveTurns: 10, retainedTurns: 10, availableTurns: 0 });
  expect(result.history[0].id).toBe('u2');
  expect(result.history.at(-2)?.content).toContain('附件正文');
  expect(prisma.message.findMany.mock.calls[0][0].where.status).toEqual({ in: ['completed'] });
  expect(runtime.previewContext).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: '约束', maxTokens: 128 }));
  expect(result).not.toHaveProperty('connection');
});

it('关闭历史时不读取历史，剩余额度以 Runtime 实际预算为准', async () => {
  const { service, agents, prisma } = setup();
  agents.getAgentConfig.mockResolvedValue({ contextLimit: 0, systemPrompt: '约束', maxTokens: 128 });
  expect(await service.memory('conversation', 'owner')).toMatchObject({ effectiveTurns: 0, retainedTurns: 0, remainingTokens: 796 });
  expect(prisma.message.findMany).not.toHaveBeenCalled();
});
