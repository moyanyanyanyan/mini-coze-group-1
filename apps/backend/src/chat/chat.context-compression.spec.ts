import { ChatService } from './chat.service';

const rows = (turns: number, content = '提瓦特代码实验') => Array.from({ length: turns }, (_, index) => [
  { id: `u${index}`, role: 'user', content: `${content}${index}`, attachments: [] },
  { id: `a${index}`, role: 'assistant', content: `确认约束${index}`, attachments: [] },
]).flat();

function setup(turns = 8) {
  const messages = rows(turns);
  const prisma = {
    message: { findMany: jest.fn().mockResolvedValue(messages) },
    conversation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    operationTelemetry: { create: jest.fn().mockResolvedValue({}) },
  };
  const runtime = { compressContext: jest.fn(async (_input: { previousSummary: string; messages: { id: string; content: string }[] }) => ({ summary: '用户正在创作原神与 AI 编程小说，保留代码标识与未完成委托。', usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 } })) };
  const service = new ChatService(prisma as never, {} as never, {} as never, runtime as never, {} as never);
  const context = (state = {}, compress = true, contextLimit = 5, current = '') =>
    (service as unknown as { conversationContext(id: string, userId: string, config: unknown, state: unknown, excluded: string[], compress: boolean, current: string): Promise<{ history: { id: string }[]; summary: string; compressionPending: boolean }> })
      .conversationContext('conversation', 'owner', { id: 'agent', model: 'model', contextLimit, maxTokens: 128, systemPrompt: '系统约束' }, state, [], compress, current);
  return { prisma, runtime, context, messages };
}

it('较早原文生成真实摘要，最近配置轮数仍保留，摘要按用户归属保存', async () => {
  const { context, runtime, prisma } = setup();
  const result = await context();
  expect(result.history.map(item => item.id)).toEqual(rows(8).slice(-10).map(item => item.id));
  expect(runtime.compressContext.mock.calls[0][0].messages.map((item: { id: string }) => item.id)).toEqual(['u0:0', 'a0:0', 'u1:0', 'a1:0', 'u2:0', 'a2:0']);
  expect(result.summary).toContain('未完成委托');
  expect(prisma.conversation.updateMany).toHaveBeenCalledWith({ where: { id: 'conversation', userId: 'owner', contextSummaryThrough: null }, data: { contextSummary: result.summary, contextSummaryThrough: 'a2' } });
  expect(prisma.operationTelemetry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'context_compression', inputTokens: 100 }) }));
});

it('已有摘要只合并新增的较早消息，不重复压缩已处理的原文', async () => {
  const { context, runtime } = setup(10);
  await context({ contextSummary: '旧摘要', contextSummaryThrough: 'a2' });
  expect(runtime.compressContext).toHaveBeenCalledWith(expect.objectContaining({ previousSummary: '旧摘要', messages: expect.arrayContaining([expect.objectContaining({ id: 'u3:0' }), expect.objectContaining({ id: 'a4:0' })]) }), undefined);
  expect(runtime.compressContext.mock.calls[0][0].messages).toHaveLength(4);
});

it('读取预览不调用模型，已保存的摘要继续生效', async () => {
  const { context, runtime, prisma } = setup();
  const result = await context({ contextSummary: '旧摘要', contextSummaryThrough: 'a0' }, false);
  expect(result).toMatchObject({ summary: '旧摘要', compressionPending: true });
  expect(runtime.compressContext).not.toHaveBeenCalled();
  expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
});

it('压缩失败不覆盖摘要或处理位置，原文保持不变', async () => {
  const { context, runtime, prisma, messages } = setup();
  runtime.compressContext.mockRejectedValue(new Error('模型服务暂不可用'));
  await expect(context()).rejects.toThrow('模型服务暂不可用');
  expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
  expect(messages).toEqual(rows(8));
});

it('关闭历史后不使用摘要，不读取历史也不调用压缩', async () => {
  const { context, runtime, prisma } = setup();
  expect(await context({ contextSummary: '旧摘要' }, true, 0)).toEqual({ history: [], summary: '', compressionPending: false });
  expect(prisma.message.findMany).not.toHaveBeenCalled();
  expect(runtime.compressContext).not.toHaveBeenCalled();
});

it('接近 Token 预算时提前压缩，较长消息分批处理而不截断原文', async () => {
  const { context, prisma, runtime } = setup(2);
  const messages = rows(2, '原神'.repeat(2300));
  prisma.message.findMany.mockResolvedValue(messages);
  const result = await context({}, true, 100, '代码'.repeat(3000));
  expect(runtime.compressContext.mock.calls.length).toBeGreaterThan(1);
  expect(runtime.compressContext.mock.calls.flatMap(call => call[0].messages).map((item: { content: string }) => item.content).join(''))
    .toBe(messages.map(item => item.content).join(''));
  expect(result.history).toHaveLength(0);
});

it('并发更新失败时拒绝覆盖别的请求保存的摘要', async () => {
  const { context, prisma } = setup();
  prisma.conversation.updateMany.mockResolvedValue({ count: 0 });
  await expect(context()).rejects.toThrow('会话上下文已更新');
});
