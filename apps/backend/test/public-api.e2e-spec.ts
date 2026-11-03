import {
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ChatService } from '../src/chat/chat.service';
import { RuntimeCallError, type RuntimeResult } from '../src/chat/runtime-client.service';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { AgentsService } from '../src/modules/agents/agents.service';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { PublicApiController } from '../src/modules/public-api/public-api.controller';
import { PublicApiService } from '../src/modules/public-api/public-api.service';

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
  let configValues: Record<string, string | undefined>;
  let config: { get: jest.Mock };
  let agents: { getPublicAgent: jest.Mock };
  let conversations: {
    create: jest.Mock;
    findOwned: jest.Mock;
  };
  let chat: { runOnce: jest.Mock };

  beforeAll(async () => {
    configValues = {};
    config = {
      get: jest.fn((key: string) => configValues[key]),
    };
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
        { provide: ConfigService, useValue: config },
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
    configValues = {
      NODE_ENV: 'test',
      PUBLIC_API_TEST_AGENT_ID: 'agent-public',
    };
    agents.getPublicAgent.mockResolvedValue({
      agentId: 'agent-public',
      ownerId: 'owner-1',
      status: 'ACTIVE',
      config: {
        id: 'agent-public',
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
      agentId: 'agent-public',
    });
    chat.runOnce.mockResolvedValue(runtimeResult);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a conversation when conversationId is omitted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好' })
      .expect(200);

    expect(conversations.create).toHaveBeenCalledWith('owner-1', 'agent-public');
    expect(chat.runOnce).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      userId: 'owner-1',
      agentId: 'agent-public',
      message: '你好',
    }));
    expect(response.body.data).toEqual(runtimeResult);
  });

  it('continues an existing conversation owned by the Agent owner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '继续', conversationId: 'conversation-1' })
      .expect(200);

    expect(conversations.findOwned).toHaveBeenCalledWith('conversation-1', 'owner-1');
    expect(conversations.create).not.toHaveBeenCalled();
    expect(chat.runOnce).toHaveBeenCalled();
  });

  it('keeps the existing RunDto validation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好', conversationId: '' })
      .expect(400);
  });

  it('rejects a missing conversation', async () => {
    conversations.findOwned.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '继续', conversationId: 'missing' })
      .expect(404);
  });

  it('rejects a conversation owned by another user', async () => {
    conversations.findOwned.mockResolvedValue({
      id: 'conversation-1',
      userId: 'other-user',
      agentId: 'agent-public',
    });

    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '继续', conversationId: 'conversation-1' })
      .expect(403);
  });

  it('rejects a conversation bound to another Agent', async () => {
    conversations.findOwned.mockResolvedValue({
      id: 'conversation-1',
      userId: 'owner-1',
      agentId: 'other-agent',
    });

    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '继续', conversationId: 'conversation-1' })
      .expect(403);
  });

  it('rejects when the temporary test Agent is not configured', async () => {
    configValues.PUBLIC_API_TEST_AGENT_ID = '';

    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好' })
      .expect(503);
  });

  it('rejects the unauthenticated test route outside development and test', async () => {
    configValues.NODE_ENV = 'production';

    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好' })
      .expect(503);
  });

  it.each([
    ['DRAFT', new ForbiddenException('Agent 尚未发布')],
    ['ARCHIVED', new ForbiddenException('Agent 已归档，暂不可调用')],
  ])('rejects a %s Agent', async (_status, error) => {
    agents.getPublicAgent.mockRejectedValue(error);

    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好' })
      .expect(403);
  });

  it('maps Runtime business failures to an HTTP error', async () => {
    chat.runOnce.mockRejectedValue(new RuntimeCallError(
      'MODEL_RATE_LIMITED',
      '模型限流',
      { kind: 'runtime', httpStatus: 503 },
    ));

    const response = await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好' })
      .expect(503);

    expect(response.body).toMatchObject({
      code: 503,
      message: '模型限流',
      data: null,
    });
  });
});
