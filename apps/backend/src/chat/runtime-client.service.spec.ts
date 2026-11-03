import {
  RuntimeCallError,
  RuntimeClientService,
  type RuntimeRequestBody,
  type RuntimeResult,
} from './runtime-client.service';

const request: RuntimeRequestBody = {
  runId: 'run-1',
  actor: { id: 'user-1' },
  conversationId: 'conversation-1',
  userMessageId: 'user-message-1',
  assistantMessageId: 'assistant-message-1',
  agentConfig: {
    id: 'agent-1',
    revision: 3,
    name: 'Published Agent',
    systemPrompt: 'Published prompt',
    model: 'deepseek-chat',
    temperature: 0.3,
    maxTokens: 1024,
    knowledgeBaseIds: [],
    pluginIds: [],
  },
  history: [],
  message: '你好',
};

const result: RuntimeResult = {
  runId: 'run-1',
  conversationId: 'conversation-1',
  assistantMessageId: 'assistant-message-1',
  status: 'completed',
  content: '你好，我是 MiniCoze',
  finishReason: 'stop',
  usage: {
    promptTokens: 10,
    completionTokens: 8,
    totalTokens: 18,
  },
  citations: [],
  toolResults: [],
};

const originalBaseUrl = process.env.AGENT_SERVICE_URL;
const originalToken = process.env.INTERNAL_SERVICE_TOKEN;

function createClient() {
  process.env.AGENT_SERVICE_URL = 'http://runtime.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-token';
  return new RuntimeClientService();
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  if (originalBaseUrl === undefined) delete process.env.AGENT_SERVICE_URL;
  else process.env.AGENT_SERVICE_URL = originalBaseUrl;
  if (originalToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
  else process.env.INTERNAL_SERVICE_TOKEN = originalToken;
});

describe('RuntimeClientService.run', () => {
  it('calls the non-stream Runtime endpoint and parses RuntimeResult', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(result), { status: 200 }),
    );

    await expect(createClient().run(request)).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://runtime.test/internal/runtime/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        headers: expect.objectContaining({
          Authorization: 'Bearer test-internal-token',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('preserves Runtime status and machine error code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ message: '模型限流' }),
      {
        status: 503,
        headers: { 'X-Runtime-Error-Code': 'MODEL_RATE_LIMITED' },
      },
    ));

    const error = await createClient().run(request).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RuntimeCallError);
    expect(error).toMatchObject({
      code: 'MODEL_RATE_LIMITED',
      message: '模型限流',
      options: {
        kind: 'runtime',
        httpStatus: 503,
      },
    });
  });

  it('distinguishes a generic HTTP failure without a Runtime error code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('gateway failed', { status: 502 }),
    );

    const error = await createClient().run(request).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'RUNTIME_UNAVAILABLE',
      options: {
        kind: 'http',
        httpStatus: 502,
      },
    });
  });

  it('distinguishes network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('network down'));

    const error = await createClient().run(request).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'RUNTIME_UNAVAILABLE',
      message: 'Runtime 网络请求失败',
      options: { kind: 'network' },
    });
  });

  it('reports timeout separately', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      })
    ));

    const pending = expect(createClient().run(request)).rejects.toMatchObject({
      code: 'RUNTIME_TIMEOUT',
      options: { kind: 'timeout' },
    });
    await jest.advanceTimersByTimeAsync(190_000);

    await pending;
  });

  it('forwards caller cancellation', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      })
    ));
    const controller = new AbortController();
    const reason = new Error('caller cancelled');

    const pending = expect(createClient().run(request, controller.signal)).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
      options: { kind: 'aborted', cause: reason },
    });
    controller.abort(reason);

    await pending;
  });

  it('fails clearly when the internal token is not configured', async () => {
    process.env.AGENT_SERVICE_URL = 'http://runtime.test';
    delete process.env.INTERNAL_SERVICE_TOKEN;
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(new RuntimeClientService().run(request)).rejects.toMatchObject({
      code: 'INTERNAL_NOT_CONFIGURED',
      options: { kind: 'configuration' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
