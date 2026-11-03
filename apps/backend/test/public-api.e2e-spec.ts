import {
  ForbiddenException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
  let chat: { runOnce: jest.Mock };

  function postRun(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/run')
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
    chat = { runOnce: jest.fn() };

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
    await app.init();
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
});
