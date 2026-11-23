import { HttpException } from '@nestjs/common';
import { PublicApiService } from './public-api.service';
import { RuntimeCallError } from '../../chat/runtime-client.service';

const principal = {
  userId: 'owner-1',
  agentId: 'agent-1',
  apiKeyId: 'key-1',
};

const runtimeStatuses: ReadonlyArray<readonly [string, number]> = [
  ['INTERNAL_ERROR', 500],
  ['INTERNAL_NOT_CONFIGURED', 503],
  ['INTERNAL_UNAUTHORIZED', 502],
  ['INVALID_REQUEST', 400],
  ['KNOWLEDGE_CONTEXT_TOO_LARGE', 502],
  ['KNOWLEDGE_FORBIDDEN', 403],
  ['KNOWLEDGE_NOT_CONFIGURED', 503],
  ['KNOWLEDGE_PROTOCOL_ERROR', 502],
  ['KNOWLEDGE_TIMEOUT', 504],
  ['KNOWLEDGE_UNAUTHORIZED', 502],
  ['KNOWLEDGE_UNAVAILABLE', 503],
  ['MODEL_AUTH_FAILED', 502],
  ['MODEL_NOT_CONFIGURED', 503],
  ['MODEL_OUTPUT_REJECTED', 502],
  ['MODEL_PROTOCOL_ERROR', 502],
  ['MODEL_QUOTA_EXCEEDED', 503],
  ['MODEL_RATE_LIMITED', 503],
  ['MODEL_STREAM_INTERRUPTED', 502],
  ['MODEL_TIMEOUT', 504],
  ['MODEL_UNAVAILABLE', 502],
  ['RUN_TIMEOUT', 504],
  ['TOOL_AUTH_FAILED', 502],
  ['TOOL_EXECUTION_REJECTED', 502],
  ['TOOL_FORBIDDEN', 502],
  ['TOOL_INVALID_ARGUMENTS', 502],
  ['TOOL_LIMIT_EXCEEDED', 502],
  ['TOOL_NOT_CONFIGURED', 503],
  ['TOOL_NOT_SUPPORTED', 502],
  ['TOOL_PROTOCOL_ERROR', 502],
  ['TOOL_RESULT_TOO_LARGE', 502],
  ['TOOL_TIMEOUT', 504],
  ['TOOL_UNAVAILABLE', 503],
];

function createService() {
  const agents = {
    getPublicAgent: jest.fn().mockResolvedValue({
      agentId: 'agent-1',
      ownerId: 'owner-1',
      status: 'ACTIVE',
      config: {
        id: 'agent-1',
        revision: 1,
        name: 'Agent',
        systemPrompt: '',
        model: 'model',
        temperature: 0.7,
        maxTokens: 1024,
        knowledgeBaseIds: [],
        pluginIds: [],
      },
    }),
  };
  const conversations = {
    create: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
    findOwned: jest.fn(),
  };
  const chat = {
    runOnce: jest.fn(),
    acquire: jest.fn(),
    release: jest.fn(),
    run: jest.fn(),
  };

  return {
    service: new PublicApiService(
      agents as never,
      conversations as never,
      chat as never,
    ),
    chat,
  };
}

describe('PublicApiService Runtime error mapping', () => {
  it.each(runtimeStatuses)('maps %s to HTTP %i', async (code, status) => {
    const { service, chat } = createService();
    chat.runOnce.mockRejectedValue(new RuntimeCallError(
      code,
      'runtime failed',
      { kind: 'runtime', httpStatus: 500 },
    ));

    const error = await service.run(
      { message: '你好' },
      principal,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
  });

  it('uses INTERNAL_ERROR for an unknown Runtime code', async () => {
    const { service, chat } = createService();
    chat.runOnce.mockRejectedValue(new RuntimeCallError(
      'UNKNOWN_RUNTIME_CODE',
      'runtime failed',
      { kind: 'runtime', httpStatus: 502 },
    ));

    const error = await service.run(
      { message: '你好' },
      principal,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(500);
  });
});
