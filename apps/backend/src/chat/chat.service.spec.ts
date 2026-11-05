import { ChatService } from './chat.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConversationsService } from '../modules/conversations/conversations.service';
import type { MessagesService } from '../modules/conversations/messages.service';
import type { AgentsService } from '../modules/agents/agents.service';
import type { RuntimeClientService, RuntimeRequestBody, RuntimeSseEvent } from './runtime-client.service';

it('passes the selected Agent configuration to Runtime and saves before completion', async () => {
  const config = {
    id: 'agent-selected', revision: 0, name: '报销助手', systemPrompt: '依据知识库回答',
    model: 'deepseek-ai/DeepSeek-V4.1-Flash', temperature: 0.7, maxTokens: 4096,
    knowledgeBaseIds: ['kb-meals'], pluginIds: [],
  };
  const userMessage = { id: 'user-message' };
  const assistantMessage = { id: 'assistant-message' };
  const create = jest.fn().mockResolvedValueOnce(userMessage).mockResolvedValueOnce(assistantMessage);
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
      message: { findFirst: jest.fn().mockResolvedValue(null), create },
      conversation: { update: jest.fn().mockResolvedValue({}) },
    }),
    message: { findMany: jest.fn().mockResolvedValue([]), update },
  } as unknown as PrismaService;
  const conversations = {
    assertOwned: jest.fn().mockResolvedValue({ agentId: config.id }),
  } as unknown as ConversationsService;
  const agents = {
    getAgentConfig: jest.fn().mockResolvedValue(config),
  } as unknown as AgentsService;
  let runtimeRequest: RuntimeRequestBody | undefined;
  const runtime = {
    stream: async function* (request: RuntimeRequestBody): AsyncGenerator<RuntimeSseEvent> {
      runtimeRequest = request;
      const envelope = { runId: request.runId, conversationId: request.conversationId, timestamp: new Date().toISOString() };
      yield { ...envelope, seq: 1, type: 'run.started', data: {} };
      yield { ...envelope, seq: 2, type: 'message.delta', data: { content: '40 元' } };
      yield { ...envelope, seq: 3, type: 'run.completed', data: { content: '40 元' } };
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
  expect(runtimeRequest?.history).toEqual([]);
  expect(update).toHaveBeenCalledWith({
    where: { id: assistantMessage.id }, data: { content: '40 元', status: 'completed' },
  });
  expect(events.map((event) => event.type)).toEqual(['run.started', 'message.delta', 'run.completed']);
});
