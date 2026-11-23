import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MiniCozeAbortError,
  MiniCozeClient,
  MiniCozeHTTPError,
  MiniCozeNetworkError,
  MiniCozeResponseParseError,
  MiniCozeSDKError,
  MiniCozeTimeoutError,
  type RunResult,
} from '../src/index.js';
import type { FetchImplementation } from '../src/http/http-client.js';

const apiKey = 'placeholder-run-key';
const baseURL = 'https://api.example.test';
const result: RunResult = {
  runId: 'run-1',
  conversationId: 'conversation-1',
  assistantMessageId: 'assistant-message-1',
  status: 'completed',
  content: '真实回复',
  finishReason: 'stop',
  usage: {
    promptTokens: 10,
    completionTokens: 4,
    totalTokens: 14,
  },
  citations: [],
  toolResults: [],
};

function createClient() {
  return new MiniCozeClient({ baseURL, apiKey });
}

function successResponse(data: unknown) {
  return new Response(JSON.stringify({
    code: 200,
    message: 'ok',
    data,
  }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MiniCozeClient.run', () => {
  it('posts the public Run contract and unwraps success data', async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => successResponse(result));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient().run({ message: '你好' })).resolves.toEqual(result);

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe('https://api.example.test/api/v1/run');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ message: '你好' }));
    expect(headers.get('authorization')).toBe(`Bearer ${apiKey}`);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('includes conversationId only when provided', async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => successResponse(result));
    vi.stubGlobal('fetch', fetchMock);

    await createClient().run({
      message: '继续',
      conversationId: 'conversation-1',
    });

    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      message: '继续',
      conversationId: 'conversation-1',
    }));
  });

  it.each([400, 401, 403, 503, 504])(
    'preserves HTTP status %i and its numeric code',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(
        JSON.stringify({
          code: status,
          message: `request failed ${status}`,
          data: null,
        }),
        { status },
      )));

      const error = await createClient()
        .run({ message: '你好' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(MiniCozeHTTPError);
      expect(error).toMatchObject({
        httpStatus: status,
        errorCode: String(status),
        message: `request failed ${status}`,
      });
    },
  );

  it('distinguishes network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network unavailable');
    }));

    await expect(createClient().run({ message: '你好' }))
      .rejects.toBeInstanceOf(MiniCozeNetworkError);
  });

  it('supports a per-call timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      })
    )));

    const error = await createClient()
      .run({ message: '你好' }, { timeoutMs: 5 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeTimeoutError);
    expect(error).toMatchObject({ timeoutMs: 5 });
  });

  it('uses the 190 second Run timeout by default', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      })
    )));

    const pending = createClient()
      .run({ message: '你好' })
      .catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(190_000);

    await expect(pending).resolves.toMatchObject({ timeoutMs: 190_000 });
  });

  it('forwards caller cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      })
    )));
    const controller = new AbortController();
    const reason = new Error('caller cancelled');

    const pending = createClient()
      .run({ message: '你好' }, { signal: controller.signal })
      .catch((caught: unknown) => caught);
    controller.abort(reason);

    const error = await pending;
    expect(error).toBeInstanceOf(MiniCozeAbortError);
    expect((error as MiniCozeAbortError).cause).toBe(reason);
  });

  it('does not expose the API key in server error messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        code: 401,
        message: `invalid API key: ${apiKey}`,
        data: null,
      }),
      { status: 401 },
    )));

    const error = await createClient()
      .run({ message: '你好' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeHTTPError);
    expect((error as MiniCozeHTTPError).message).not.toContain(apiKey);
    expect((error as MiniCozeHTTPError).message).toContain('[REDACTED]');
  });

  it.each([
    { ok: true },
    { code: 200, message: 'ok', data: {} },
    { code: 201, message: 'ok', data: result },
  ])('rejects a malformed success response', async (payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(payload),
      { status: 200 },
    )));

    await expect(createClient().run({ message: '你好' }))
      .rejects.toBeInstanceOf(MiniCozeResponseParseError);
  });

  it('validates Run parameters before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient().run({ message: '' }))
      .rejects.toBeInstanceOf(MiniCozeSDKError);
    await expect(createClient().run({ message: '你好', conversationId: '' }))
      .rejects.toBeInstanceOf(MiniCozeSDKError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
