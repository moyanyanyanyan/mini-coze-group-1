import { ChatService } from './chat.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConversationsService } from '../modules/conversations/conversations.service';
import type { MessagesService } from '../modules/conversations/messages.service';
import type { AgentsService } from '../modules/agents/agents.service';
import type { RuntimeClientService, RuntimeRequestBody, RuntimeSseEvent } from './runtime-client.service';

it.each([[0, 0], [5, 5], [100, 10]])('配置 %i 轮时只向 Runtime 发送最近 %i 个完整问答对', async (contextLimit, expectedTurns) => {
  const config = {
    id: 'agent-selected', revision: 0, name: '报销助手', systemPrompt: '依据知识库回答',
    model: 'deepseek-ai/DeepSeek-V4.1-Flash', temperature: 0.7, maxTokens: 4096,
    knowledgeBaseIds: ['kb-meals'], pluginIds: [],
  };
  const userMessage = { id: 'user-message' };
  const assistantMessage = { id: 'assistant-message' };
  const create = jest.fn().mockResolvedValueOnce(userMessage).mockResolvedValueOnce(assistantMessage);
  const update = jest.fn().mockResolvedValue({});
  const longReply = '头' + '😀'.repeat(7999) + '尾';
  const history = Array.from({ length: 12 }, (_, i) => [
    { id: 'u' + i, role: 'user', content: '问题' },
    { id: 'a' + i, role: 'assistant', content: i === 11 ? longReply : '回答' },
  ]).flat();
  const findMany = jest.fn().mockResolvedValue(history);
  const prisma = {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
      message: { findFirst: jest.fn().mockResolvedValue(null), create },
      conversation: { update: jest.fn().mockResolvedValue({}) },
    }),
    message: { findMany, update },
  } as unknown as PrismaService;
  const conversations = {
    assertOwned: jest.fn().mockResolvedValue({ agentId: config.id }),
  } as unknown as ConversationsService;
  const agents = {
    getAgentConfig: jest.fn().mockResolvedValue({ ...config, contextLimit }),
  } as unknown as AgentsService;
  let runtimeRequest: RuntimeRequestBody | undefined;
  const runtime = {
    stream: async function* (request: RuntimeRequestBody): AsyncGenerator<RuntimeSseEvent> {
      runtimeRequest = request;
      const envelope = { runId: request.runId, conversationId: request.conversationId, timestamp: new Date().toISOString() };
      yield {
        ...envelope,
        seq: 1,
        type: 'run.started',
        data: { assistantMessageId: request.assistantMessageId },
      };
      yield { ...envelope, seq: 2, type: 'message.delta', data: { content: '40 元' } };
      yield {
        ...envelope,
        seq: 3,
        type: 'run.completed',
        data: {
          runId: request.runId,
          conversationId: request.conversationId,
          assistantMessageId: request.assistantMessageId,
          status: 'completed',
          content: '40 元',
          finishReason: 'stop',
          usage: null,
          citations: [],
          toolResults: [],
        },
      };
    },
  } as unknown as RuntimeClientService;
  const service = new ChatService(prisma, conversations, {} as MessagesService, runtime, agents);

  const events: RuntimeSseEvent[] = [];
  for await (const event of service.run({
    conversationId: 'conversation-1', userId: 'actor-1', content: '餐费多少？', signal: new AbortController().signal,
  })) {
    events.push(event);
  }

  expect(agents.getAgentConfig).toHaveBeenCalledWith(config.id, 'actor-1');
  expect(runtimeRequest?.agentConfig).toEqual(config);
  expect(runtimeRequest?.message).toBe('餐费多少？');
  const sent = runtimeRequest!.history;
  expect(sent.map((row) => row.id)).toEqual(history.slice(history.length - expectedTurns * 2).map((row) => row.id));
  if (expectedTurns === 0) {
    expect(findMany).not.toHaveBeenCalled();
  } else {
    const excerpt = sent[sent.length - 1].content;
    expect(Array.from(excerpt)).toHaveLength(8000);
    expect(excerpt.startsWith('头')).toBe(true);
    expect(excerpt.endsWith('尾')).toBe(true);
    expect(excerpt).toContain('省略');
    expect(history[history.length - 1].content).toBe(longReply);
  }
  expect(update).toHaveBeenCalledWith({
    where: { id: assistantMessage.id }, data: { content: '40 元', status: 'completed' },
  });
  expect(events.map((event) => event.type)).toEqual(['run.started', 'message.delta', 'run.completed']);
});
