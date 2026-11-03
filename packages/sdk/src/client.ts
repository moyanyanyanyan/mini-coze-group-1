import {
  MiniCozeResponseParseError,
  MiniCozeSDKError,
} from './http/errors.js';
import { HttpClient } from './http/http-client.js';
import type {
  MiniCozeClientOptions,
  RunOptions,
  RunParams,
  RunResult,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RUN_TIMEOUT_MS = 190_000;

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

    const body = params.conversationId === undefined
      ? { message: params.message }
      : { message: params.message, conversationId: params.conversationId };
    const payload = await this.#httpClient.requestJson<unknown>({
      path: '/api/v1/run',
      method: 'POST',
      body,
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

  // TODO(api): 待公开 Stream 接口契约确认后实现 stream()。
}
