import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MiniCozeAbortError,
  MiniCozeClient,
  MiniCozeHTTPError,
  MiniCozeStreamError,
  MiniCozeTimeoutError,
  type RunResult,
  type RunStreamEvent,
} from '../src/index.js';
import type { FetchImplementation } from '../src/http/http-client.js';

const apiKey = 'placeholder-stream-key';
const baseURL = 'https://api.example.test';
const encoder = new TextEncoder();

const completed: RunResult = {
  runId: 'run-1',
  conversationId: 'conversation-1',
  assistantMessageId: 'assistant-message-1',
  status: 'completed',
  content: '你好世界',
  finishReason: 'stop',
  usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
  citations: [],
  toolResults: [],
};

function envelope(
  seq: number,
  type: RunStreamEvent['type'],
  data: unknown,
): RunStreamEvent {
  return {
    runId: 'run-1',
    conversationId: 'conversation-1',
    seq,
    timestamp: '2026-11-04T00:00:00Z',
    type,
    data,
    sseId: `run-1:${seq}`,
  } as RunStreamEvent;
}

function frame(event: RunStreamEvent, lineEnding = '\n'): string {
  return [
    `id: ${event.runId}:${event.seq}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join(lineEnding);
}

function responseFromChunks(chunks: string[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createClient() {
  return new MiniCozeClient({ baseURL, apiKey });
}

async function collect(
  client: MiniCozeClient,
  message = '你好',
  conversationId?: string,
) {
  const events: RunStreamEvent[] = [];
  for await (const event of client.stream({ message, conversationId })) events.push(event);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MiniCozeClient.stream', () => {
  it('posts the public Stream contract and yields deltas through completion', async () => {
    const events = [
      envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' }),
      envelope(2, 'message.delta', { content: '你好' }),
      envelope(3, 'message.delta', { content: '世界' }),
      envelope(4, 'run.completed', completed),
    ];
    const fetchMock = vi.fn<FetchImplementation>(async () => (
      responseFromChunks([frame(events[0]), frame(events[1]), frame(events[2]), frame(events[3])])
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(collect(createClient())).resolves.toEqual(events);

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe('https://api.example.test/api/v1/stream');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ message: '你好' }));
    expect(headers.get('authorization')).toBe(`Bearer ${apiKey}`);
    expect(headers.get('accept')).toBe('text/event-stream');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('handles chunk boundaries, CRLF, multi-line data, and heartbeat comments', async () => {
    const first = envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' });
    const second = envelope(2, 'message.delta', { content: 'ok' });
    const third = envelope(3, 'run.completed', { ...completed, content: 'ok' });
    const raw = [
      frame(first, '\r\n'),
      ': heartbeat\r\n\r\n',
      'id: run-1:2\r\nevent: message.delta\r\ndata: {"runId":"run-1",\r\n',
      'data: "conversationId":"conversation-1","seq":2,"timestamp":"2026-11-04T00:00:00Z",\r\n',
      'data: "type":"message.delta","data":{"content":"ok"}}\r\n\r\n',
      frame(third, '\r\n'),
    ].join('');
    vi.stubGlobal('fetch', vi.fn(async () => responseFromChunks([
      raw.slice(0, 17),
      raw.slice(17, 63),
      raw.slice(63, 121),
      raw.slice(121),
    ])));

    await expect(collect(createClient())).resolves.toEqual([first, second, third]);
  });

  it('parses knowledge.result and sends conversationId when resuming', async () => {
    const started = envelope(1, 'run.started', {
      assistantMessageId: 'assistant-message-1',
    });
    const knowledge = envelope(2, 'knowledge.result', {
      status: 'matched',
      citations: [{ knowledgeBaseId: 'kb-1', documentId: 'doc-1', chunkId: 'chunk-1', title: '规则' }],
    });
    const content = envelope(3, 'message.delta', { content: '你好世界' });
    const completedEvent = envelope(4, 'run.completed', completed);
    const fetchMock = vi.fn<FetchImplementation>(async () => responseFromChunks([
      frame(started),
      frame(knowledge),
      frame(content),
      frame(completedEvent),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(collect(createClient(), '继续', 'conversation-1')).resolves.toEqual([
      started,
      knowledge,
      content,
      completedEvent,
    ]);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      message: '继续',
      conversationId: 'conversation-1',
    }));
  });

  it('returns run.failed as the terminal event', async () => {
    const failed = envelope(2, 'run.failed', {
      code: 'MODEL_RATE_LIMITED',
      message: '模型限流',
      retryable: true,
    });
    vi.stubGlobal('fetch', vi.fn(async () => responseFromChunks([
      frame(envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' })),
      frame(failed),
    ])));

    await expect(collect(createClient())).resolves.toEqual([
      envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' }),
      failed,
    ]);
  });

  it('supports multiple tool rounds and continues after a failed tool', async () => {
    const events = [
      envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' }),
      envelope(2, 'tool.started', { toolCallId: 'call-1', toolName: 'echo_text' }),
      envelope(3, 'tool.completed', {
        toolCallId: 'call-1',
        toolName: 'echo_text',
        status: 'failed',
        error: { code: 'TOOL_TIMEOUT', message: '工具超时' },
      }),
      envelope(4, 'tool.started', { toolCallId: 'call-2', toolName: 'echo_text' }),
      envelope(5, 'tool.completed', {
        toolCallId: 'call-2',
        toolName: 'echo_text',
        status: 'succeeded',
        output: { text: 'ok' },
      }),
      envelope(6, 'message.delta', { content: '最终回答' }),
      envelope(7, 'run.completed', { ...completed, content: '最终回答' }),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => responseFromChunks(
      events.map((event) => frame(event)),
    )));

    await expect(collect(createClient())).resolves.toEqual(events);
  });

  it('rejects run.completed content that differs from the deltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseFromChunks([
      frame(envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' })),
      frame(envelope(2, 'message.delta', { content: '半截' })),
      frame(envelope(3, 'run.completed', { ...completed, content: '不同内容' })),
    ])));

    await expect(collect(createClient())).rejects.toBeInstanceOf(MiniCozeStreamError);
  });

  it('preserves HTTP errors and redacts the API key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 401, message: `invalid API key: ${apiKey}`, data: null }),
      { status: 401 },
    )));

    const error = await collect(createClient()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MiniCozeHTTPError);
    expect((error as MiniCozeHTTPError).message).not.toContain(apiKey);
    expect((error as MiniCozeHTTPError).message).toContain('[REDACTED]');
  });

  it('rejects EOF without a terminal event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseFromChunks([
      frame(envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' })),
      frame(envelope(2, 'message.delta', { content: 'partial' })),
    ])));

    await expect(collect(createClient())).rejects.toBeInstanceOf(MiniCozeStreamError);
  });

  it('reports a network interruption while reading the stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error('connection reset'));
        },
      }),
      { status: 200 },
    )));

    await expect(collect(createClient())).rejects.toBeInstanceOf(MiniCozeStreamError);
  });

  it('supports caller cancellation', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((resolve) => {
      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          init?.signal?.addEventListener('abort', () => {
            streamController.error(init.signal?.reason);
          }, { once: true });
          streamController.enqueue(encoder.encode(
            frame(envelope(1, 'run.started', { assistantMessageId: 'assistant-message-1' })),
          ));
        },
      });
      resolve(new Response(stream, { status: 200 }));
    })));

    const iterator = createClient().stream(
      { message: '你好' },
      { signal: controller.signal },
    )[Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    controller.abort(new Error('stop'));

    await expect(pending).rejects.toBeInstanceOf(MiniCozeAbortError);
  });

  it('applies the Stream timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(init.signal?.reason),
        { once: true },
      );
    })));
    const promise = collect(createClient()).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(190_000);

    await expect(promise).resolves.toBeInstanceOf(MiniCozeTimeoutError);
  });
});
