import { describe, expect, it } from 'vitest';
import {
  MiniCozeAbortError,
  MiniCozeStreamError,
  SSEParser,
  parseSSEStream,
} from '../src/index.js';

const encoder = new TextEncoder();

function streamFromChunks(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const events = [];

  for await (const event of parseSSEStream(streamFromChunks(chunks))) {
    events.push(event);
  }

  return events;
}

describe('SSE parser', () => {
  it('parses one complete event', async () => {
    await expect(collect([
      'event: notice\nid: event-1\ndata: hello\n\n',
    ])).resolves.toEqual([
      { event: 'notice', data: 'hello', id: 'event-1' },
    ]);
  });

  it('parses multiple events from one chunk', async () => {
    await expect(collect([
      'data: first\n\ndata: second\n\n',
    ])).resolves.toEqual([
      { event: 'message', data: 'first', id: undefined },
      { event: 'message', data: 'second', id: undefined },
    ]);
  });

  it('joins multiple data lines with newlines', async () => {
    await expect(collect([
      'data: first line\ndata: second line\n\n',
    ])).resolves.toEqual([
      { event: 'message', data: 'first line\nsecond line', id: undefined },
    ]);
  });

  it('handles an event split across network chunks and CRLF boundaries', async () => {
    await expect(collect([
      'event: update\r',
      '\ndata: hel',
      'lo\r\n\r',
      '\n',
    ])).resolves.toEqual([
      { event: 'update', data: 'hello', id: undefined },
    ]);
  });

  it('decodes UTF-8 characters split across network chunks', async () => {
    const bytes = encoder.encode('event: update\ndata: 你好🙂\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 20));
        controller.enqueue(bytes.slice(20, 22));
        controller.enqueue(bytes.slice(22));
        controller.close();
      },
    });
    const events = [];

    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      { event: 'update', data: '你好🙂', id: undefined },
    ]);
  });

  it('parses CRLF events', async () => {
    await expect(collect([
      'event: crlf\r\nid: 7\r\ndata: value\r\n\r\n',
    ])).resolves.toEqual([
      { event: 'crlf', data: 'value', id: '7' },
    ]);
  });

  it('ignores comments and heartbeat lines', async () => {
    await expect(collect([
      ': keepalive\n\n',
      ': another heartbeat\n',
      'data: visible\n\n',
    ])).resolves.toEqual([
      { event: 'message', data: 'visible', id: undefined },
    ]);
  });

  it('does not dispatch an incomplete final event at EOF', async () => {
    await expect(collect([
      'event: unfinished\ndata: partial\n',
    ])).resolves.toEqual([]);
  });

  it('completes normally at EOF after a terminated event', async () => {
    await expect(collect([
      'event: complete\ndata: value\n\n',
    ])).resolves.toEqual([
      { event: 'complete', data: 'value', id: undefined },
    ]);
  });

  it('wraps stream read failures', async () => {
    const readError = new Error('reader failed');
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(readError);
      },
    });
    const iterator = parseSSEStream(stream);

    const error = await iterator.next().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeStreamError);
    expect(error).toMatchObject({
      name: 'MiniCozeStreamError',
      message: 'Stream reading failed',
    });
    expect((error as MiniCozeStreamError).cause).toBe(readError);
  });

  it('supports active cancellation through AbortSignal', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined);
      },
    });
    const controller = new AbortController();
    const abortReason = new Error('caller stopped the stream');
    const iterator = parseSSEStream(stream, { signal: controller.signal });
    const pendingEvent = iterator.next();

    controller.abort(abortReason);
    const error = await pendingEvent.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MiniCozeAbortError);
    expect(error).toMatchObject({
      name: 'MiniCozeAbortError',
      message: 'Stream reading was aborted',
    });
    expect((error as MiniCozeAbortError).cause).toBe(abortReason);
  });

  it('dispatches a final event terminated by CR at EOF', () => {
    const parser = new SSEParser();

    expect(parser.push('data: complete\r\r')).toEqual([]);
    expect(parser.finish()).toEqual([
      { event: 'message', data: 'complete', id: undefined },
    ]);
  });
});
