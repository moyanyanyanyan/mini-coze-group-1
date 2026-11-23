import { describe, expect, it, vi } from 'vitest';
import {
  MiniCozeAbortError,
  MiniCozeHTTPError,
  MiniCozeNetworkError,
  MiniCozeResponseParseError,
  MiniCozeTimeoutError,
} from '../src/index.js';
import {
  HttpClient,
  type FetchImplementation,
} from '../src/http/http-client.js';

const baseURL = 'https://api.example.test/v1/';
const apiKey = 'placeholder-sdk-key';

function createClient(fetchImplementation: FetchImplementation, timeoutMs = 1_000) {
  return new HttpClient({
    baseURL,
    apiKey,
    timeoutMs,
    fetch: fetchImplementation,
  });
}

describe('HttpClient', () => {
  it('sends JSON and parses a successful JSON response', async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => new Response(
      JSON.stringify({ ok: true }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    const client = createClient(fetchMock);

    const result = await client.requestJson<{ ok: boolean }>({
      path: '/example',
      method: 'POST',
      body: { query: 'hello' },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(url).toBe('https://api.example.test/v1/example');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"query":"hello"}');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe(`Bearer ${apiKey}`);
  });

  it('preserves HTTP status, optional server details and trace information', async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => new Response(
      JSON.stringify({
        error: {
          code: 'UPSTREAM_BUSY',
          message: 'Service temporarily unavailable',
        },
      }),
      {
        status: 503,
        headers: { 'x-trace-id': 'trace-123' },
      },
    ));

    const error = await createClient(fetchMock)
      .requestJson({ path: 'example' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeHTTPError);
    expect(error).toMatchObject({
      name: 'MiniCozeHTTPError',
      message: 'Service temporarily unavailable',
      httpStatus: 503,
      errorCode: 'UPSTREAM_BUSY',
      traceId: 'trace-123',
    });
  });

  it('distinguishes network failures from HTTP failures', async () => {
    const networkCause = new TypeError('network unavailable');
    const fetchMock = vi.fn<FetchImplementation>(async () => {
      throw networkCause;
    });

    const error = await createClient(fetchMock)
      .requestJson({ path: 'example' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeNetworkError);
    expect(error).toMatchObject({
      name: 'MiniCozeNetworkError',
      message: 'Network request failed',
    });
    expect((error as MiniCozeNetworkError).cause).toBe(networkCause);
  });

  it('distinguishes invalid JSON responses from HTTP failures', async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => new Response(
      'not-json',
      { status: 200 },
    ));

    const error = await createClient(fetchMock)
      .requestJson({ path: 'example' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeResponseParseError);
    expect(error).toMatchObject({
      name: 'MiniCozeResponseParseError',
      message: 'Failed to parse JSON response',
    });
  });

  it('reports request timeout separately', async () => {
    const fetchMock: FetchImplementation = vi.fn((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const rejectOnAbort = () => reject(signal?.reason);

        if (signal?.aborted) {
          rejectOnAbort();
        } else {
          signal?.addEventListener('abort', rejectOnAbort, { once: true });
        }
      })
    ));

    const error = await createClient(fetchMock, 5)
      .requestJson({ path: 'example' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeTimeoutError);
    expect(error).toMatchObject({
      name: 'MiniCozeTimeoutError',
      timeoutMs: 5,
    });
  });

  it('honors the caller AbortSignal without replacing its reason', async () => {
    const fetchMock: FetchImplementation = vi.fn((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      })
    ));
    const controller = new AbortController();
    const abortReason = new Error('caller cancelled');
    const request = createClient(fetchMock, 1_000).requestJson({
      path: 'example',
      signal: controller.signal,
    });

    controller.abort(abortReason);
    const error = await request.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeAbortError);
    expect(error).toMatchObject({
      name: 'MiniCozeAbortError',
      message: 'Request was aborted',
    });
    expect((error as MiniCozeAbortError).cause).toBe(abortReason);
  });

  it('does not start a request when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn<FetchImplementation>();
    const controller = new AbortController();
    const abortReason = new Error('already cancelled');
    controller.abort(abortReason);

    const error = await createClient(fetchMock)
      .requestJson({ path: 'example', signal: controller.signal })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeAbortError);
    expect((error as MiniCozeAbortError).cause).toBe(abortReason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts the configured API key from server error messages and codes', async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => new Response(
      JSON.stringify({
        code: `CODE_${apiKey}`,
        message: `Request rejected for ${apiKey}`,
      }),
      { status: 401 },
    ));

    const error = await createClient(fetchMock)
      .requestJson({ path: 'example' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeHTTPError);
    expect((error as MiniCozeHTTPError).message).toBe('Request rejected for [REDACTED]');
    expect((error as MiniCozeHTTPError).message).not.toContain(apiKey);
    expect((error as MiniCozeHTTPError).errorCode).toBe('CODE_[REDACTED]');
  });

  it('allows callers to disable the default timeout', async () => {
    const fetchMock = vi.fn<FetchImplementation>(async (_url, init) => {
      expect(init?.signal?.aborted).toBe(false);
      return new Response(JSON.stringify({ ok: true }));
    });
    const client = createClient(fetchMock, 1);

    await expect(client.requestJson({
      path: 'stream-like',
      timeoutMs: null,
    })).resolves.toEqual({ ok: true });
  });
});
