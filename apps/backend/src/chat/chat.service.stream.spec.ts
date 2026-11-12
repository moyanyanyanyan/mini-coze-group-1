import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgentsService } from '../modules/agents/agents.service';
import type { ConversationsService } from '../modules/conversations/conversations.service';
import type { MessagesService } from '../modules/conversations/messages.service';
import { ChatService } from './chat.service';
import {
  RuntimeCallError,
  type RuntimeClientService,
  type RuntimeRequestBody,
  type RuntimeSseEvent,
} from './runtime-client.service';

const agentConfig = {
  id: 'agent-1',
  revision: 2,
  name: 'Public Agent',
  systemPrompt: 'Published prompt',
  model: 'deepseek-chat',
  provider: 'deepseek' as const,
  upstreamModel: 'deepseek-chat',
  temperature: 0.3,
  maxTokens: 1024,
  knowledgeBaseIds: [],
  pluginIds: [],
};

function createHarness() {
  const create = jest.fn()
    .mockResolvedValueOnce({ id: 'user-message' })
    .mockResolvedValueOnce({ id: 'assistant-message' });
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
      message: { findFirst: jest.fn().mockResolvedValue(null), create },
      conversation: { update: jest.fn().mockResolvedValue({}) },
    }),
    message: { findMany: jest.fn().mockResolvedValue([]), update },
  } as unknown as PrismaService;
  const conversations = {
    assertOwned: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      agentId: 'agent-1',
    }),
  } as unknown as ConversationsService;
  const runtime = {
    stream: jest.fn(),
  };
  const agents = {
    getAgentConfig: jest.fn(),
  } as unknown as AgentsService;
  const service = new ChatService(
    prisma,
    conversations,
    {} as MessagesService,
    runtime as unknown as RuntimeClientService,
    agents,
  );
  return { service, runtime, update, agents };
}

function event(
  request: RuntimeRequestBody,
  seq: number,
  type: RuntimeSseEvent['type'],
  data: Record<string, unknown>,
): RuntimeSseEvent {
  return {
    runId: request.runId,
    conversationId: request.conversationId,
    seq,
    timestamp: '2026-11-04T00:00:00Z',
    type,
    data,
  };
}

async function collect(service: ChatService, agentSnapshot = true) {
  const events: RuntimeSseEvent[] = [];
  for await (const item of service.run({
    conversationId: 'conversation-1',
    userId: 'owner-1',
    content: '问题',
    signal: new AbortController().signal,
    agentId: agentSnapshot ? 'agent-1' : undefined,
    agentConfig: agentSnapshot ? agentConfig : undefined,
  })) {
    events.push(item);
  }
  return events;
}

describe('ChatService stream persistence', () => {
  it('uses the published Agent config and saves completed content', async () => {
    const harness = createHarness();
    let request: RuntimeRequestBody | undefined;
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      request = body;
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'message.delta', { content: '回答' });
      yield event(body, 3, 'run.completed', {
        runId: body.runId,
        conversationId: body.conversationId,
        assistantMessageId: body.assistantMessageId,
        status: 'completed',
        content: '回答',
        finishReason: 'stop',
        usage: null,
        citations: [],
        toolResults: [],
      });
    });

    const events = await collect(harness.service);

    expect(request?.agentConfig).toEqual(agentConfig);
    expect(harness.agents.getAgentConfig).not.toHaveBeenCalled();
    expect(events.map((item) => item.type)).toEqual([
      'run.started',
      'message.delta',
      'run.completed',
    ]);
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message' },
      data: { content: '回答', status: 'completed' },
    });
  });

  it('saves partial content as failed when Runtime emits run.failed', async () => {
    const harness = createHarness();
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'message.delta', { content: '半截' });
      yield event(body, 3, 'run.failed', {
        code: 'MODEL_STREAM_INTERRUPTED',
        message: '流中断',
        retryable: true,
      });
    });

    const events = await collect(harness.service);

    expect(events.at(-1)?.type).toBe('run.failed');
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message' },
      data: { content: '半截', status: 'failed' },
    });
  });

  it('forwards multiple tool rounds and continues after tool.completed failed', async () => {
    const harness = createHarness();
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'tool.started', { toolCallId: 'call-1', toolName: 'echo_text' });
      yield event(body, 3, 'tool.completed', {
        toolCallId: 'call-1',
        toolName: 'echo_text',
        status: 'failed',
        error: { code: 'TOOL_TIMEOUT', message: '工具超时' },
      });
      yield event(body, 4, 'tool.started', { toolCallId: 'call-2', toolName: 'echo_text' });
      yield event(body, 5, 'tool.completed', {
        toolCallId: 'call-2',
        toolName: 'echo_text',
        status: 'succeeded',
        output: { text: 'ok' },
      });
      yield event(body, 6, 'message.delta', { content: '最终回答' });
      yield event(body, 7, 'run.completed', {
        runId: body.runId,
        conversationId: body.conversationId,
        assistantMessageId: body.assistantMessageId,
        status: 'completed',
        content: '最终回答',
        finishReason: 'stop',
        usage: null,
        citations: [],
        toolResults: [
          {
            toolCallId: 'call-1',
            toolName: 'echo_text',
            status: 'failed',
            error: { code: 'TOOL_TIMEOUT', message: '工具超时' },
          },
          {
            toolCallId: 'call-2',
            toolName: 'echo_text',
            status: 'succeeded',
            output: { text: 'ok' },
          },
        ],
      });
    });

    const events = await collect(harness.service);

    expect(events.map((item) => item.type)).toEqual([
      'run.started',
      'tool.started',
      'tool.completed',
      'tool.started',
      'tool.completed',
      'message.delta',
      'run.completed',
    ]);
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message' },
      data: { content: '最终回答', status: 'completed' },
    });
  });

  it('saves partial content as cancelled when the client aborts', async () => {
    const harness = createHarness();
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'message.delta', { content: '半截' });
      throw new RuntimeCallError('REQUEST_ABORTED', '取消', { kind: 'aborted' });
    });

    const events = await collect(harness.service);

    expect(events.map((item) => item.type)).toEqual(['run.started', 'message.delta']);
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message' },
      data: { content: '半截', status: 'cancelled' },
    });
  });

  it('saves cancelled content when the iterator is explicitly closed', async () => {
    const harness = createHarness();
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'message.delta', { content: '半截' });
    });
    const iterator = harness.service.run({
      conversationId: 'conversation-1',
      userId: 'owner-1',
      content: '问题',
      signal: new AbortController().signal,
      agentId: 'agent-1',
      agentConfig,
    });

    await iterator.next();
    await iterator.next();
    await iterator.return(undefined);

    expect(harness.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message' },
      data: { content: '半截', status: 'cancelled' },
    });
  });

  it('does not treat EOF without a terminal event as success', async () => {
    const harness = createHarness();
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'message.delta', { content: '半截' });
    });

    const events = await collect(harness.service);

    expect(events.at(-1)).toMatchObject({
      type: 'run.failed',
      seq: 3,
      data: { code: 'MODEL_STREAM_INTERRUPTED', retryable: true },
    });
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message' },
      data: { content: '半截', status: 'failed' },
    });
  });

  it('turns a completed event into a failure when persistence fails', async () => {
    const harness = createHarness();
    harness.update.mockRejectedValue(new Error('database unavailable'));
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'run.completed', {
        runId: body.runId,
        conversationId: body.conversationId,
        assistantMessageId: body.assistantMessageId,
        status: 'completed',
        content: '回答',
        finishReason: 'stop',
        usage: null,
        citations: [],
        toolResults: [],
      });
    });

    const events = await collect(harness.service);

    expect(events.at(-1)).toMatchObject({
      type: 'run.failed',
      seq: 3,
      data: { code: 'PERSISTENCE_FAILED' },
    });
  });

  it('rejects completed content that differs from accumulated deltas', async () => {
    const harness = createHarness();
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'message.delta', { content: '半截' });
      yield event(body, 3, 'run.completed', {
        runId: body.runId,
        conversationId: body.conversationId,
        assistantMessageId: body.assistantMessageId,
        status: 'completed',
        content: '不同的完整内容',
        finishReason: 'stop',
        usage: null,
        citations: [],
        toolResults: [],
      });
    });

    const events = await collect(harness.service);

    expect(events.at(-1)).toMatchObject({
      type: 'run.failed',
      data: { code: 'MODEL_PROTOCOL_ERROR' },
    });
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message' },
      data: { content: '半截', status: 'failed' },
    });
  });

  it('logs cancellation persistence failures without message content', async () => {
    const harness = createHarness();
    let request: RuntimeRequestBody | undefined;
    harness.update.mockRejectedValue(new Error('database unavailable'));
    harness.runtime.stream.mockImplementation(async function* (body: RuntimeRequestBody) {
      request = body;
      yield event(body, 1, 'run.started', { assistantMessageId: body.assistantMessageId });
      yield event(body, 2, 'message.delta', { content: '敏感半截内容' });
      throw new RuntimeCallError('REQUEST_ABORTED', '取消', { kind: 'aborted' });
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await collect(harness.service);

    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain(`runId=${request?.runId}`);
    expect(logged).toContain('conversationId=conversation-1');
    expect(logged).toContain('status=cancelled');
    expect(logged).toContain('errorType=Error');
    expect(logged).not.toContain('敏感半截内容');
    errorSpy.mockRestore();
  });
});
