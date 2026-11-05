import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgentsService } from '../modules/agents/agents.service';
import type { ConversationsService } from '../modules/conversations/conversations.service';
import type { MessagesService } from '../modules/conversations/messages.service';
import { ChatService } from './chat.service';
import {
  RuntimeCallError,
  type RuntimeClientService,
  type RuntimeRequestBody,
  type RuntimeResult,
} from './runtime-client.service';

const agentConfig = {
  id: 'agent-public',
  revision: 4,
  name: 'Published Agent',
  systemPrompt: 'Published prompt',
  model: 'deepseek-chat',
  temperature: 0.3,
  maxTokens: 1024,
  knowledgeBaseIds: ['kb-1'],
  pluginIds: ['plugin_echo'],
};

function createHarness() {
  const historyRows = [
    {
      id: 'old-user',
      conversationId: 'conversation-1',
      role: 'user',
      status: 'completed',
      seq: 1,
      content: '上一问',
      createdAt: new Date(),
    },
    {
      id: 'old-assistant',
      conversationId: 'conversation-1',
      role: 'assistant',
      status: 'completed',
      seq: 2,
      content: '上一答',
      createdAt: new Date(),
    },
    {
      id: 'user-current',
      conversationId: 'conversation-1',
      role: 'user',
      status: 'completed',
      seq: 3,
      content: '当前问题',
      createdAt: new Date(),
    },
    {
      id: 'assistant-current',
      conversationId: 'conversation-1',
      role: 'assistant',
      status: 'pending',
      seq: 4,
      content: '',
      createdAt: new Date(),
    },
  ];
  const create = jest.fn()
    .mockResolvedValueOnce({ id: 'user-current' })
    .mockResolvedValueOnce({ id: 'assistant-current' });
  const conversationUpdate = jest.fn().mockResolvedValue({});
  const messageFindMany = jest.fn().mockResolvedValue(historyRows);
  const messageUpdate = jest.fn().mockResolvedValue({});
  const prisma = {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
      message: {
        findFirst: jest.fn().mockResolvedValue({ seq: 2 }),
        create,
      },
      conversation: { update: conversationUpdate },
    }),
    message: {
      findMany: messageFindMany,
      update: messageUpdate,
    },
  } as unknown as PrismaService;
  const conversations = {
    assertOwned: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      agentId: 'agent-public',
    }),
  } as unknown as ConversationsService;
  const runtime = { run: jest.fn() };
  const service = new ChatService(
    prisma,
    conversations,
    {} as MessagesService,
    runtime as unknown as RuntimeClientService,
    {} as AgentsService,
  );

  return {
    service,
    runtime,
    create,
    conversationUpdate,
    messageFindMany,
    messageUpdate,
  };
}

describe('ChatService.runOnce', () => {
  it('reuses turn persistence, excludes current messages from history, and saves completion', async () => {
    const harness = createHarness();
    let requestBody: RuntimeRequestBody | undefined;
    harness.runtime.run.mockImplementation(async (request: RuntimeRequestBody): Promise<RuntimeResult> => {
      requestBody = request;
      return {
        runId: request.runId,
        conversationId: request.conversationId,
        assistantMessageId: request.assistantMessageId,
        status: 'completed',
        content: '真实回答',
        finishReason: 'stop',
        citations: [],
        toolResults: [],
      };
    });

    const result = await harness.service.runOnce({
      conversationId: 'conversation-1',
      userId: 'owner-1',
      agentId: 'agent-public',
      message: '当前问题',
      agentConfig,
    });

    expect(harness.create).toHaveBeenNthCalledWith(1, {
      data: {
        conversationId: 'conversation-1',
        role: 'user',
        status: 'completed',
        seq: 3,
        content: '当前问题',
      },
    });
    expect(harness.create).toHaveBeenNthCalledWith(2, {
      data: {
        conversationId: 'conversation-1',
        role: 'assistant',
        status: 'pending',
        seq: 4,
        content: '',
      },
    });
    expect(harness.conversationUpdate).toHaveBeenCalled();
    expect(harness.messageFindMany).toHaveBeenCalledWith({
      where: { conversationId: 'conversation-1', status: { in: ['completed'] } },
      orderBy: { seq: 'asc' },
    });
    expect(requestBody).toMatchObject({
      actor: { id: 'owner-1' },
      conversationId: 'conversation-1',
      userMessageId: 'user-current',
      assistantMessageId: 'assistant-current',
      agentConfig,
      history: [
        { id: 'old-user', role: 'user', content: '上一问' },
        { id: 'old-assistant', role: 'assistant', content: '上一答' },
      ],
      message: '当前问题',
    });
    expect(harness.messageUpdate).toHaveBeenCalledWith({
      where: { id: 'assistant-current' },
      data: { content: '真实回答', status: 'completed' },
    });
    expect(result.content).toBe('真实回答');
  });

  it('marks the AssistantMessage failed when Runtime fails', async () => {
    const harness = createHarness();
    harness.runtime.run.mockRejectedValue(
      new RuntimeCallError('MODEL_UNAVAILABLE', '模型不可用', {
        kind: 'runtime',
        httpStatus: 502,
      }),
    );

    await expect(harness.service.runOnce({
      conversationId: 'conversation-1',
      userId: 'owner-1',
      agentId: 'agent-public',
      message: '当前问题',
      agentConfig,
    })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });

    expect(harness.messageUpdate).toHaveBeenCalledWith({
      where: { id: 'assistant-current' },
      data: { content: '', status: 'failed' },
    });
  });

  it('rejects a conversation bound to another Agent', async () => {
    const harness = createHarness();
    (harness.service as unknown as {
      conversations: { assertOwned: jest.Mock };
    }).conversations.assertOwned.mockResolvedValue({
      id: 'conversation-1',
      agentId: 'other-agent',
    });

    await expect(harness.service.runOnce({
      conversationId: 'conversation-1',
      userId: 'owner-1',
      agentId: 'agent-public',
      message: '当前问题',
      agentConfig,
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.runtime.run).not.toHaveBeenCalled();
  });
});
