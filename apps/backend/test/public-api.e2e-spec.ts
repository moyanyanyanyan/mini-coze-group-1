import {
  ForbiddenException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { ChatService } from '../src/chat/chat.service';
import { RuntimeCallError, type RuntimeResult } from '../src/chat/runtime-client.service';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { AgentsService } from '../src/modules/agents/agents.service';
import { ApiKeyGuard } from '../src/modules/api-keys/api-key.guard';
import { ApiKeysService } from '../src/modules/api-keys/api-keys.service';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { PublicApiController } from '../src/modules/public-api/public-api.controller';
import { PublicApiService } from '../src/modules/public-api/public-api.service';

const API_KEY = `mk_live_${'a'.repeat(43)}`;

const runtimeResult: RuntimeResult = {
  runId: 'run-1',
  conversationId: 'conversation-1',
  assistantMessageId: 'assistant-message-1',
  status: 'completed',
  content: '真实回复',
  finishReason: 'stop',
  usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
  citations: [],
  toolResults: [],
};

describe('Public API run endpoint', () => {
  let app: INestApplication;
  let apiKeys: { authenticate: jest.Mock };
  let agents: { getPublicAgent: jest.Mock };
  let conversations: {
    create: jest.Mock;
    findOwned: jest.Mock;
  };
  let chat: {
    runOnce: jest.Mock;
    acquire: jest.Mock;
    release: jest.Mock;
    run: jest.Mock;
  };

  function postRun(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/run')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send(body);
  }

  function postStream(
    body: Record<string, unknown>,
    agent = app.getHttpServer(),
  ) {
    return request(agent)
      .post('/api/v1/stream')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send(body);
  }

  beforeAll(async () => {
    apiKeys = { authenticate: jest.fn() };
    agents = { getPublicAgent: jest.fn() };
    conversations = {
      create: jest.fn(),
      findOwned: jest.fn(),
    };
    chat = {
      runOnce: jest.fn(),
      acquire: jest.fn(),
      release: jest.fn(),
      run: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PublicApiController],
      providers: [
        PublicApiService,
        ApiKeyGuard,
        { provide: ApiKeysService, useValue: apiKeys },
        { provide: AgentsService, useValue: agents },
        { provide: ConversationsService, useValue: conversations },
        { provide: ChatService, useValue: chat },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    apiKeys.authenticate.mockResolvedValue({
      userId: 'owner-1',
      agentId: 'agent-from-key',
      apiKeyId: 'key-1',
    });
    agents.getPublicAgent.mockResolvedValue({
      agentId: 'agent-from-key',
      ownerId: 'owner-1',
      status: 'ACTIVE',
      config: {
        id: 'agent-from-key',
        revision: 2,
        name: 'Public Agent',
        systemPrompt: 'Published prompt',
        model: 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 1024,
        knowledgeBaseIds: [],
        pluginIds: [],
      },
    });
    conversations.create.mockResolvedValue({ id: 'conversation-1' });
    conversations.findOwned.mockResolvedValue({
      id: 'conversation-1',
      userId: 'owner-1',
      agentId: 'agent-from-key',
    });
    chat.runOnce.mockResolvedValue(runtimeResult);
    chat.run.mockImplementation(async function* () {
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 1,
        timestamp: '2026-11-04T00:00:00Z',
        type: 'run.started',
        data: { assistantMessageId: 'assistant-message-1' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 2,
        timestamp: '2026-11-04T00:00:01Z',
        type: 'message.delta',
        data: { content: '你好' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 3,
        timestamp: '2026-11-04T00:00:02Z',
        type: 'run.completed',
        data: runtimeResult,
      };
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('authenticates a valid key and creates a conversation when conversationId is omitted', async () => {
    const response = await postRun({ message: '你好' })
      .expect(200);

    expect(apiKeys.authenticate).toHaveBeenCalledWith(API_KEY);
    expect(agents.getPublicAgent).toHaveBeenCalledWith('agent-from-key');
    expect(conversations.create).toHaveBeenCalledWith('owner-1', 'agent-from-key');
    expect(chat.runOnce).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      userId: 'owner-1',
      agentId: 'agent-from-key',
      message: '你好',
    }));
    expect(response.body.data).toEqual(runtimeResult);
  });

  it('continues an existing conversation owned by the API Key principal', async () => {
    await postRun({ message: '继续', conversationId: 'conversation-1' })
      .expect(200);

    expect(conversations.findOwned).toHaveBeenCalledWith('conversation-1', 'owner-1');
    expect(conversations.create).not.toHaveBeenCalled();
    expect(chat.runOnce).toHaveBeenCalled();
  });

  it('uses the principal Agent instead of an agentId from the request body', async () => {
    await postRun({
      message: '你好',
      agentId: 'body-agent',
    }).expect(200);

    expect(agents.getPublicAgent).toHaveBeenCalledWith('agent-from-key');
    expect(agents.getPublicAgent).not.toHaveBeenCalledWith('body-agent');
  });

  it('keeps the existing RunDto validation', async () => {
    await postRun({}).expect(400);
    await postRun({ message: '你好', conversationId: '' }).expect(400);
  });

  it('rejects a missing conversation', async () => {
    conversations.findOwned.mockResolvedValue(null);

    await postRun({ message: '继续', conversationId: 'missing' })
      .expect(404);
  });

  it('rejects a conversation owned by another user', async () => {
    conversations.findOwned.mockResolvedValue({
      id: 'conversation-1',
      userId: 'other-user',
      agentId: 'agent-from-key',
    });

    await postRun({ message: '继续', conversationId: 'conversation-1' })
      .expect(403);
  });

  it('rejects a conversation bound to another Agent', async () => {
    conversations.findOwned.mockResolvedValue({
      id: 'conversation-1',
      userId: 'owner-1',
      agentId: 'other-agent',
    });

    await postRun({ message: '继续', conversationId: 'conversation-1' })
      .expect(403);
  });

  it('rejects a request without an API Key', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好' })
      .expect(401);

    expect(apiKeys.authenticate).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({ code: 401, data: null });
  });

  it.each(['invalid', 'revoked'])('rejects an %s API Key with 401', async (_case) => {
    apiKeys.authenticate.mockRejectedValue(new UnauthorizedException('API Key 无效'));

    const response = await postRun({ message: '你好' })
      .expect(401);

    expect(response.body).toMatchObject({ code: 401, data: null });
    expect(agents.getPublicAgent).not.toHaveBeenCalled();
  });

  it.each([
    ['DRAFT', new ForbiddenException('Agent 尚未发布')],
    ['ARCHIVED', new ForbiddenException('Agent 已归档，暂不可调用')],
  ])('rejects a %s Agent with 403', async (_status, error) => {
    agents.getPublicAgent.mockRejectedValue(error);

    await postRun({ message: '你好' })
      .expect(403);
  });

  it('rejects a published Agent owned by a different principal user', async () => {
    agents.getPublicAgent.mockResolvedValue({
      agentId: 'agent-from-key',
      ownerId: 'other-owner',
      status: 'ACTIVE',
      config: {
        id: 'agent-from-key',
        revision: 2,
        name: 'Public Agent',
        systemPrompt: 'Published prompt',
        model: 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 1024,
        knowledgeBaseIds: [],
        pluginIds: [],
      },
    });

    await postRun({ message: '你好' }).expect(403);

    expect(conversations.create).not.toHaveBeenCalled();
    expect(chat.runOnce).not.toHaveBeenCalled();
  });

  it('maps Runtime business failures to an HTTP error', async () => {
    chat.runOnce.mockRejectedValue(new RuntimeCallError(
      'MODEL_RATE_LIMITED',
      '模型限流',
      { kind: 'runtime', httpStatus: 503 },
    ));

    const response = await postRun({ message: '你好' })
      .expect(503);

    expect(response.body).toMatchObject({
      code: 503,
      message: '模型限流',
      data: null,
    });
  });

  it('streams Runtime events through the authenticated public endpoint', async () => {
    const response = await postStream({
      message: '你好',
      agentId: 'body-agent',
    })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    expect(agents.getPublicAgent).toHaveBeenCalledWith('agent-from-key');
    expect(agents.getPublicAgent).not.toHaveBeenCalledWith('body-agent');
    expect(chat.acquire).toHaveBeenCalledWith('conversation-1');
    expect(chat.release).toHaveBeenCalledWith('conversation-1');
    expect(response.text).toContain('id: run-1:1');
    expect(response.text).toContain('event: run.started');
    expect(response.text).toContain('event: message.delta');
    expect(response.text).toContain('event: run.completed');
  });

  it('rejects a Stream request without an API Key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/stream')
      .send({ message: '你好' })
      .expect(401);

    expect(chat.acquire).not.toHaveBeenCalled();
  });

  it('forwards multi-round tool events without treating a failed tool as terminal', async () => {
    agents.getPublicAgent.mockResolvedValue({
      agentId: 'agent-from-key',
      ownerId: 'owner-1',
      status: 'ACTIVE',
      config: {
        id: 'agent-from-key',
        revision: 2,
        name: 'Public Agent',
        systemPrompt: 'Published prompt',
        model: 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 1024,
        knowledgeBaseIds: [],
        pluginIds: ['plugin_echo'],
      },
    });
    chat.run.mockImplementation(async function* () {
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 1,
        timestamp: '2026-11-04T00:00:00Z',
        type: 'run.started',
        data: { assistantMessageId: 'assistant-message-1' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 2,
        timestamp: '2026-11-04T00:00:01Z',
        type: 'tool.started',
        data: { toolCallId: 'call-1', toolName: 'echo_text' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 3,
        timestamp: '2026-11-04T00:00:02Z',
        type: 'tool.completed',
        data: {
          toolCallId: 'call-1',
          toolName: 'echo_text',
          status: 'failed',
          error: { code: 'TOOL_TIMEOUT', message: '工具超时' },
        },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 4,
        timestamp: '2026-11-04T00:00:03Z',
        type: 'tool.started',
        data: { toolCallId: 'call-2', toolName: 'echo_text' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 5,
        timestamp: '2026-11-04T00:00:04Z',
        type: 'tool.completed',
        data: {
          toolCallId: 'call-2',
          toolName: 'echo_text',
          status: 'succeeded',
          output: { text: 'ok' },
        },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 6,
        timestamp: '2026-11-04T00:00:05Z',
        type: 'message.delta',
        data: { content: '最终回答' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 7,
        timestamp: '2026-11-04T00:00:06Z',
        type: 'run.completed',
        data: { ...runtimeResult, content: '最终回答' },
      };
    });

    const response = await postStream({ message: '你好' }).expect(200);

    expect(response.text).toContain('event: tool.started');
    expect(response.text).toContain('"status":"failed"');
    expect(response.text).toContain('"status":"succeeded"');
    expect(response.text).toContain('event: run.completed');
    expect(response.text.match(/event: run\.completed/g)).toHaveLength(1);
    expect(chat.acquire).toHaveBeenCalledWith('conversation-1');
    expect(chat.release).toHaveBeenCalledWith('conversation-1');
  });

  it('rejects an invalid API Key on the Stream endpoint', async () => {
    apiKeys.authenticate.mockRejectedValue(new UnauthorizedException('API Key 无效'));

    await postStream({ message: '你好' }).expect(401);

    expect(agents.getPublicAgent).not.toHaveBeenCalled();
    expect(chat.acquire).not.toHaveBeenCalled();
  });

  it.each([
    ['DRAFT', new ForbiddenException('Agent 尚未发布')],
    ['ARCHIVED', new ForbiddenException('Agent 已归档，暂不可调用')],
  ])('rejects a %s Agent before starting the Stream', async (_status, error) => {
    agents.getPublicAgent.mockRejectedValue(error);

    await postStream({ message: '你好' }).expect(403);

    expect(chat.acquire).not.toHaveBeenCalled();
  });

  it('maps a Runtime preflight error before writing SSE headers', async () => {
    chat.run.mockImplementation(async function* () {
      throw new RuntimeCallError(
        'MODEL_RATE_LIMITED',
        '模型限流',
        { kind: 'runtime', httpStatus: 503 },
      );
    });

    const response = await postStream({ message: '你好' }).expect(503);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({ code: 503, message: '模型限流', data: null });
    expect(chat.release).toHaveBeenCalledWith('conversation-1');
  });

  it('streams run.failed as the terminal event and releases the lock', async () => {
    chat.run.mockImplementation(async function* () {
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 1,
        timestamp: '2026-11-04T00:00:00Z',
        type: 'run.started',
        data: { assistantMessageId: 'assistant-message-1' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 2,
        timestamp: '2026-11-04T00:00:01Z',
        type: 'run.failed',
        data: { code: 'MODEL_RATE_LIMITED', message: '模型限流', retryable: true },
      };
    });

    const response = await postStream({ message: '你好' }).expect(200);

    expect(response.text).toContain('event: run.failed');
    expect(response.text).toContain('"code":"MODEL_RATE_LIMITED"');
    expect(chat.release).toHaveBeenCalledWith('conversation-1');
  });

  it('removes internal knowledge chunks and scores from public events', async () => {
    chat.run.mockImplementation(async function* () {
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 1,
        timestamp: '2026-11-04T00:00:00Z',
        type: 'run.started',
        data: { assistantMessageId: 'assistant-message-1' },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 2,
        timestamp: '2026-11-04T00:00:01Z',
        type: 'knowledge.result',
        data: {
          status: 'matched',
          chunks: [{ content: '内部片段正文', score: 0.9 }],
          citations: [{
            knowledgeBaseId: 'kb-1',
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            title: '报销规则',
            position: { page: 2 },
            content: '内部片段正文',
            score: 0.9,
          }],
        },
      };
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 3,
        timestamp: '2026-11-04T00:00:02Z',
        type: 'run.completed',
        data: runtimeResult,
      };
    });

    const response = await postStream({ message: '你好' }).expect(200);

    expect(response.text).toContain('"knowledgeBaseId":"kb-1"');
    expect(response.text).toContain('"position":{"page":2}');
    expect(response.text).not.toContain('内部片段正文');
    expect(response.text).not.toContain('"score"');
    expect(response.text).not.toContain('"chunks"');
  });

  it('aborts the upstream Stream and releases the lock when the client disconnects', async () => {
    let aborted!: () => void;
    const abortSeen = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    let released!: () => void;
    const releaseSeen = new Promise<void>((resolve) => {
      released = resolve;
    });
    chat.release.mockImplementation(() => released());
    chat.run.mockImplementation(async function* (input: { signal: AbortSignal }) {
      yield {
        runId: 'run-1',
        conversationId: 'conversation-1',
        seq: 1,
        timestamp: '2026-11-04T00:00:00Z',
        type: 'run.started',
        data: { assistantMessageId: 'assistant-message-1' },
      };
      await new Promise<void>((resolve) => {
        input.signal.addEventListener('abort', () => {
          aborted();
          resolve();
        }, { once: true });
      });
      throw new RuntimeCallError('REQUEST_ABORTED', '取消', { kind: 'aborted' });
    });
    const address = app.getHttpServer().address() as AddressInfo;
    const clientRequest = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/api/v1/stream',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    }, (response) => {
      response.once('data', () => clientRequest.destroy());
      response.resume();
    });
    clientRequest.on('error', () => undefined);
    clientRequest.end(JSON.stringify({ message: '你好' }));

    await abortSeen;
    await releaseSeen;
    expect(chat.acquire).toHaveBeenCalledWith('conversation-1');
  });
});
