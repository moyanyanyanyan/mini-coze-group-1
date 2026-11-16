import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { RuntimeSseEvent } from '../../chat/runtime-client.service';
import {
  PublicApiController,
  STREAM_HEARTBEAT_MS,
} from './public-api.controller';
import type { PublicApiService, PublicStreamPlan } from './public-api.service';

const plan: PublicStreamPlan = {
  conversationId: 'conversation-1',
  userId: 'user-1',
  agentId: 'agent-1',
  agentConfig: {
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
};

const started: RuntimeSseEvent = {
  runId: 'run-1',
  conversationId: 'conversation-1',
  seq: 1,
  timestamp: '2026-11-04T00:00:00Z',
  type: 'run.started',
  data: { assistantMessageId: 'assistant-message-1' },
};

const delta: RuntimeSseEvent = {
  ...started,
  seq: 2,
  type: 'message.delta',
  data: { content: '半截' },
};

class FakeResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  readonly writes: string[] = [];
  readonly writeHead = jest.fn();
  readonly flushHeaders = jest.fn();

  constructor(
    private readonly failOnSeq?: number,
    private readonly onWrite?: (chunk: string) => void,
  ) {
    super();
  }

  write(chunk: string) {
    if (this.failOnSeq !== undefined && chunk.includes(`"seq":${this.failOnSeq}`)) {
      throw new Error('response write failed');
    }
    this.writes.push(chunk);
    this.onWrite?.(chunk);
    return true;
  }

  end() {
    this.writableEnded = true;
    this.emit('close');
  }
}

function controllerWith(service: {
  prepareStream: jest.Mock;
  stream: jest.Mock;
  releaseStream: jest.Mock;
}) {
  return new PublicApiController(service as unknown as PublicApiService);
}

describe('PublicApiController stream cleanup', () => {
  it('aborts and waits for iterator exit before releasing the lock on write failure', async () => {
    let aborted = false;
    let upstreamExited = false;
    let releasedAfterUpstreamExit = false;
    let abortSeenBeforeReturn = false;
    const returnIterator = jest.fn(async () => {
      abortSeenBeforeReturn = aborted;
      await new Promise((resolve) => setImmediate(resolve));
      upstreamExited = true;
      return { done: true as const, value: undefined };
    });
    const next = jest.fn()
      .mockResolvedValueOnce({ done: false, value: started })
      .mockResolvedValueOnce({ done: false, value: delta });
    const iterable = {
      next,
      return: returnIterator,
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    const service = {
      prepareStream: jest.fn().mockResolvedValue(plan),
      stream: jest.fn((_plan, _message, signal: AbortSignal) => {
        signal.addEventListener('abort', () => {
          aborted = true;
        }, { once: true });
        return iterable;
      }),
      releaseStream: jest.fn(() => {
        releasedAfterUpstreamExit = upstreamExited;
      }),
    };
    const response = new FakeResponse(2);

    await controllerWith(service).stream(
      { message: '问题' },
      { userId: 'user-1', agentId: 'agent-1', apiKeyId: 'key-1' },
      response as unknown as Response,
    );

    expect(aborted).toBe(true);
    expect(abortSeenBeforeReturn).toBe(true);
    expect(returnIterator).toHaveBeenCalledTimes(1);
    expect(releasedAfterUpstreamExit).toBe(true);
    expect(service.releaseStream).toHaveBeenCalledTimes(1);
    expect(response.writes.some((chunk) => chunk.includes('event: run.started'))).toBe(true);
    expect(response.writes.join('')).not.toContain('event: run.completed');
    expect(response.writes.filter((chunk) => chunk.includes('event: run.failed')))
      .toHaveLength(1);
  });

  it('sends comment heartbeats while idle without changing business sequence', async () => {
    jest.useFakeTimers();
    let resolveIdleNext: (() => void) | undefined;
    let releaseExited = false;
    const iterable = {
      next: jest.fn()
        .mockResolvedValueOnce({ done: false, value: started })
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveIdleNext = () => resolve({ done: true as const, value: undefined });
        })),
      return: jest.fn(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        releaseExited = true;
        return { done: true as const, value: undefined };
      }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    const service = {
      prepareStream: jest.fn().mockResolvedValue(plan),
      stream: jest.fn((_plan, _message, signal: AbortSignal) => {
        signal.addEventListener('abort', () => resolveIdleNext?.(), { once: true });
        return iterable;
      }),
      releaseStream: jest.fn(() => releaseExited),
    };
    let firstWritten!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      firstWritten = resolve;
    });
    const response = new FakeResponse(undefined, (chunk) => {
      if (chunk.includes('event: run.started')) firstWritten();
    });

    const pending = controllerWith(service).stream(
      { message: '问题' },
      { userId: 'user-1', agentId: 'agent-1', apiKeyId: 'key-1' },
      response as unknown as Response,
    );
    await firstWrite;
    await jest.advanceTimersByTimeAsync(STREAM_HEARTBEAT_MS);
    expect(response.writes).toContain(': heartbeat\n\n');
    expect(response.writes.join('')).not.toContain('"seq":2');

    response.emit('close');
    await pending;
    expect(service.releaseStream).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
