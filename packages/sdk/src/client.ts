import { MiniCozeSDKError } from './http/errors.js';
import { HttpClient } from './http/http-client.js';
import type { MiniCozeClientOptions } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

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

  // TODO(api): 待公开 Run 接口契约确认后实现 run()。
  // TODO(api): 待公开 Stream 接口契约确认后实现 stream()。
}
