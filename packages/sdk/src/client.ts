import {
  MiniCozeResponseParseError,
  MiniCozeSDKError,
  MiniCozeStreamError,
} from './http/errors.js';
import { HttpClient } from './http/http-client.js';
import type { SSEEvent } from './stream/sse-parser.js';
import type {
  MiniCozeClientOptions,
  RunOptions,
  RunParams,
  RunResult,
  RunStreamEvent,
  StreamOptions,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RUN_TIMEOUT_MS = 190_000;
const DEFAULT_STREAM_TIMEOUT_MS = 190_000;

function requireNonEmptyString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MiniCozeSDKError(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function requireBaseURL(value: unknown) {
  const baseURL = requireNonEmptyString(value, 'baseURL');
  let parsedURL: URL;

  try {
    parsedURL = new URL(baseURL);
  } catch {
    throw new MiniCozeSDKError('baseURL must be a valid URL');
  }

  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new MiniCozeSDKError('baseURL must use HTTP or HTTPS');
  }

  return baseURL.replace(/\/+$/, '');
}

function requireTimeout(value: unknown) {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MiniCozeSDKError('timeoutMs must be a positive finite number');
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunResult(value: unknown): value is RunResult {
  if (!isRecord(value)) return false;
  const usage = value.usage;
  return (
    typeof value.runId === 'string'
    && typeof value.conversationId === 'string'
    && typeof value.assistantMessageId === 'string'
    && value.status === 'completed'
    && typeof value.content === 'string'
    && typeof value.finishReason === 'string'
    && (
      usage === undefined
      || usage === null
      || (
        isRecord(usage)
        && typeof usage.promptTokens === 'number'
        && typeof usage.completionTokens === 'number'
        && typeof usage.totalTokens === 'number'
      )
    )
    && Array.isArray(value.citations)
    && Array.isArray(value.toolResults)
  );
}

function validateRunParams(params: RunParams) {
  if (!params || typeof params !== 'object') {
    throw new MiniCozeSDKError('run params are required');
  }
  if (typeof params.message !== 'string' || params.message.length === 0) {
    throw new MiniCozeSDKError('message must be a non-empty string');
  }
  if (
    params.conversationId !== undefined
    && (typeof params.conversationId !== 'string' || params.conversationId.length === 0)
  ) {
    throw new MiniCozeSDKError('conversationId must be a non-empty string when provided');
  }
}

function buildRunBody(params: RunParams) {
  return params.conversationId === undefined
    ? { message: params.message }
    : { message: params.message, conversationId: params.conversationId };
}

function parseStreamEvent(raw: SSEEvent): RunStreamEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.data);
  } catch (error) {
    throw new MiniCozeResponseParseError('Invalid Stream event JSON', {
      cause: error,
    });
  }

  if (
    !isRecord(parsed)
    || typeof parsed.runId !== 'string'
    || typeof parsed.conversationId !== 'string'
    || !Number.isInteger(parsed.seq)
    || (parsed.seq as number) < 1
    || typeof parsed.timestamp !== 'string'
    || typeof parsed.type !== 'string'
    || !isRecord(parsed.data)
    || raw.event !== parsed.type
    || raw.id !== `${parsed.runId}:${parsed.seq}`
  ) {
    throw new MiniCozeStreamError('Invalid Stream event envelope');
  }

  switch (parsed.type) {
    case 'run.started':
      if (typeof parsed.data.assistantMessageId !== 'string') {
        throw new MiniCozeStreamError('Invalid run.started event');
      }
      break;
    case 'knowledge.result':
      if (
        (parsed.data.status !== 'matched' && parsed.data.status !== 'no_match')
        || !Array.isArray(parsed.data.citations)
      ) {
        throw new MiniCozeStreamError('Invalid knowledge.result event');
      }
      break;
    case 'message.delta':
      if (typeof parsed.data.content !== 'string') {
        throw new MiniCozeStreamError('Invalid message.delta event');
      }
      break;
    case 'tool.started':
      if (
        typeof parsed.data.toolCallId !== 'string'
        || typeof parsed.data.toolName !== 'string'
      ) {
        throw new MiniCozeStreamError('Invalid tool.started event');
      }
      break;
    case 'tool.completed':
      if (
        typeof parsed.data.toolCallId !== 'string'
        || typeof parsed.data.toolName !== 'string'
        || (parsed.data.status !== 'succeeded' && parsed.data.status !== 'failed')
        || (
          parsed.data.status === 'failed'
          && !isRecord(parsed.data.error)
        )
        || (
          parsed.data.status === 'succeeded'
          && !('output' in parsed.data)
        )
      ) {
        throw new MiniCozeStreamError('Invalid tool.completed event');
      }
      break;
    case 'run.completed':
      if (!isRunResult(parsed.data)) {
        throw new MiniCozeStreamError('Invalid run.completed event');
      }
      break;
    case 'run.failed':
      if (
        typeof parsed.data.code !== 'string'
        || typeof parsed.data.message !== 'string'
        || typeof parsed.data.retryable !== 'boolean'
      ) {
        throw new MiniCozeStreamError('Invalid run.failed event');
      }
      break;
    default:
      throw new MiniCozeStreamError(`Unsupported Stream event: ${parsed.type}`);
  }

  return {
    ...parsed,
    sseId: raw.id ?? '',
  } as RunStreamEvent;
}

export class MiniCozeClient {
  readonly baseURL: string;
  readonly timeoutMs: number;
  #httpClient: HttpClient;

  constructor(options: MiniCozeClientOptions) {
    if (!options || typeof options !== 'object') {
      throw new MiniCozeSDKError('MiniCozeClient options are required');
    }

    this.baseURL = requireBaseURL(options.baseURL);
    const apiKey = requireNonEmptyString(options.apiKey, 'apiKey');
    this.timeoutMs = requireTimeout(options.timeoutMs);
    this.#httpClient = new HttpClient({
      baseURL: this.baseURL,
      apiKey,
      timeoutMs: this.timeoutMs,
    });
  }

  async run(params: RunParams, options: RunOptions = {}): Promise<RunResult> {
    validateRunParams(params);

    const payload = await this.#httpClient.requestJson<unknown>({
      path: '/api/v1/run',
      method: 'POST',
      body: buildRunBody(params),
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
    });

    if (
      !isRecord(payload)
      || payload.code !== 200
      || !('data' in payload)
      || !isRunResult(payload.data)
    ) {
      throw new MiniCozeResponseParseError('Invalid MiniCoze Run response', {
        cause: payload,
      });
    }

    return payload.data;
  }

  async *stream(
    params: RunParams,
    options: StreamOptions = {},
  ): AsyncGenerator<RunStreamEvent> {
    validateRunParams(params);

    let expectedSeq = 1;
    let started = false;
    let expectedRunId: string | undefined;
    let expectedConversationId: string | undefined;
    let expectedAssistantMessageId: string | undefined;
    let streamedContent = '';
    for await (const raw of this.#httpClient.requestSse({
      path: '/api/v1/stream',
      method: 'POST',
      body: buildRunBody(params),
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
    })) {
      const event = parseStreamEvent(raw);
      if (event.seq !== expectedSeq) {
        throw new MiniCozeStreamError('Stream event sequence is not continuous', {
          cause: event,
        });
      }
      if (
        (expectedRunId !== undefined && event.runId !== expectedRunId)
        || (
          expectedConversationId !== undefined
          && event.conversationId !== expectedConversationId
        )
      ) {
        throw new MiniCozeStreamError('Stream event identifiers changed mid-run', {
          cause: event,
        });
      }
      expectedRunId ??= event.runId;
      expectedConversationId ??= event.conversationId;

      if (!started) {
        if (event.type !== 'run.started') {
          throw new MiniCozeStreamError('Stream did not start with run.started', {
            cause: event,
          });
        }
        started = true;
        expectedAssistantMessageId = event.data.assistantMessageId;
      } else if (event.type === 'run.started') {
        throw new MiniCozeStreamError('Stream repeated run.started', {
          cause: event,
        });
      }
      if (
        event.type === 'run.completed'
        && (
          event.data.runId !== expectedRunId
          || event.data.conversationId !== expectedConversationId
          || event.data.assistantMessageId !== expectedAssistantMessageId
          || event.data.content !== streamedContent
        )
      ) {
        throw new MiniCozeStreamError('run.completed does not match the streamed result', {
          cause: event,
        });
      }
      if (event.type === 'message.delta') {
        streamedContent += event.data.content;
      }

      expectedSeq += 1;
      yield event;

      if (event.type === 'run.completed' || event.type === 'run.failed') {
        return;
      }
    }

    throw new MiniCozeStreamError('Stream ended without a terminal event');
  }
}
