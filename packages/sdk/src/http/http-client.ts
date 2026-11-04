import {
  MiniCozeAbortError,
  MiniCozeHTTPError,
  MiniCozeNetworkError,
  MiniCozeResponseParseError,
  MiniCozeSDKError,
  MiniCozeTimeoutError,
} from './errors.js';
import { parseSSEStream, type SSEEvent } from '../stream/sse-parser.js';

export type FetchImplementation = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpClientOptions {
  baseURL: string;
  apiKey: string;
  timeoutMs?: number;
  fetch?: FetchImplementation;
}

export interface HttpRequestOptions {
  path: string;
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
  signal?: AbortSignal;
  /** `undefined` uses the client timeout; `null` disables the timeout. */
  timeoutMs?: number | null;
}

interface ErrorPayloadDetails {
  code?: string;
  message?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalErrorCode(value: unknown) {
  const stringCode = optionalString(value);
  if (stringCode) return stringCode;
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;
}

function extractErrorDetails(payload: unknown): ErrorPayloadDetails {
  // The server error schema is not final; expose common fields only when present.
  if (!isRecord(payload)) {
    return {};
  }

  const nestedError = isRecord(payload.error) ? payload.error : undefined;

  return {
    code: optionalErrorCode(nestedError?.code)
      ?? optionalErrorCode(payload.code)
      ?? optionalErrorCode(payload.errorCode),
    message: optionalString(nestedError?.message)
      ?? optionalString(payload.message),
  };
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export class HttpClient {
  #baseURL: string;
  #apiKey: string;
  #timeoutMs: number;
  #fetch: FetchImplementation;

  constructor(options: HttpClientOptions) {
    if (!options.baseURL.trim()) {
      throw new MiniCozeSDKError('baseURL must be a non-empty string');
    }

    if (!options.apiKey.trim()) {
      throw new MiniCozeSDKError('apiKey must be a non-empty string');
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new MiniCozeSDKError('timeoutMs must be a positive finite number');
    }

    this.#baseURL = options.baseURL.replace(/\/+$/, '');
    this.#apiKey = options.apiKey;
    this.#timeoutMs = timeoutMs;
    this.#fetch = options.fetch ?? fetch;
  }

  async requestJson<T>(options: HttpRequestOptions): Promise<T> {
    if (!options.path.trim()) {
      throw new MiniCozeSDKError('path must be a non-empty string');
    }

    const timeoutMs = options.timeoutMs === undefined
      ? this.#timeoutMs
      : options.timeoutMs;

    if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      throw new MiniCozeSDKError('timeoutMs must be a positive finite number or null');
    }

    const hasBody = options.body !== undefined;
    let body: string | undefined;

    if (hasBody) {
      try {
        body = JSON.stringify(options.body);
      } catch (cause) {
        throw new MiniCozeSDKError('Request body must be JSON serializable', { cause });
      }

      if (body === undefined) {
        throw new MiniCozeSDKError('Request body must be JSON serializable');
      }
    }

    const headers = new Headers({
      Accept: 'application/json',
      // TODO(api): Keep authentication centralized here until the public contract is final.
      Authorization: `Bearer ${this.#apiKey}`,
    });

    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }

    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });

    const requestURL = this.#joinURL(options.path);
    const controller = new AbortController();
    const callerSignal = options.signal;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const forwardAbort = () => controller.abort(callerSignal?.reason);

    if (callerSignal?.aborted) {
      throw new MiniCozeAbortError('Request was aborted', {
        cause: callerSignal.reason,
      });
    }

    callerSignal?.addEventListener('abort', forwardAbort, { once: true });

    if (callerSignal?.aborted) {
      forwardAbort();
    }

    if (timeoutMs !== null) {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Request timed out', 'TimeoutError'));
      }, timeoutMs);
    }

    try {
      const response = await this.#fetch(requestURL, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      });
      const responseText = await response.text();
      let payload: unknown;
      let parseError: unknown;

      if (responseText.trim()) {
        try {
          payload = JSON.parse(responseText);
        } catch (error) {
          parseError = error;
        }
      }

      if (!response.ok) {
        throw this.#createHTTPError(response, payload, parseError);
      }

      if (parseError) {
        throw new MiniCozeResponseParseError('Failed to parse JSON response', {
          cause: parseError,
        });
      }

      return payload as T;
    } catch (error) {
      if (error instanceof MiniCozeSDKError) {
        throw error;
      }

      if (timedOut) {
        throw new MiniCozeTimeoutError(`Request timed out after ${timeoutMs} ms`, {
          timeoutMs: timeoutMs as number,
          cause: error,
        });
      }

      if (callerSignal?.aborted || isAbortLikeError(error)) {
        throw new MiniCozeAbortError('Request was aborted', {
          cause: callerSignal?.reason ?? error,
        });
      }

      throw new MiniCozeNetworkError('Network request failed', { cause: error });
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  }

  async *requestSse(options: HttpRequestOptions): AsyncGenerator<SSEEvent> {
    if (!options.path.trim()) {
      throw new MiniCozeSDKError('path must be a non-empty string');
    }

    const timeoutMs = options.timeoutMs === undefined
      ? this.#timeoutMs
      : options.timeoutMs;

    if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      throw new MiniCozeSDKError('timeoutMs must be a positive finite number or null');
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      try {
        body = JSON.stringify(options.body);
      } catch (cause) {
        throw new MiniCozeSDKError('Request body must be JSON serializable', { cause });
      }
      if (body === undefined) {
        throw new MiniCozeSDKError('Request body must be JSON serializable');
      }
    }

    const headers = new Headers({
      Accept: 'text/event-stream',
      Authorization: `Bearer ${this.#apiKey}`,
    });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));

    const controller = new AbortController();
    const callerSignal = options.signal;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const forwardAbort = () => controller.abort(callerSignal?.reason);

    if (callerSignal?.aborted) {
      throw new MiniCozeAbortError('Request was aborted', {
        cause: callerSignal.reason,
      });
    }
    callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    if (timeoutMs !== null) {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Stream timed out', 'TimeoutError'));
      }, timeoutMs);
    }

    try {
      const response = await this.#fetch(this.#joinURL(options.path), {
        method: options.method ?? 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        let payload: unknown;
        let parseError: unknown;
        if (text.trim()) {
          try {
            payload = JSON.parse(text);
          } catch (error) {
            parseError = error;
          }
        }
        throw this.#createHTTPError(response, payload, parseError);
      }

      if (!response.body) {
        throw new MiniCozeNetworkError('Stream response has no body');
      }

      for await (const event of parseSSEStream(response.body, {
        signal: controller.signal,
      })) {
        yield event;
      }
    } catch (error) {
      if (timedOut) {
        throw new MiniCozeTimeoutError(`Stream timed out after ${timeoutMs} ms`, {
          timeoutMs: timeoutMs as number,
          cause: error,
        });
      }
      if (callerSignal?.aborted) {
        throw new MiniCozeAbortError('Request was aborted', {
          cause: callerSignal.reason ?? error,
        });
      }
      if (error instanceof MiniCozeSDKError) throw error;
      if (isAbortLikeError(error)) {
        throw new MiniCozeAbortError('Request was aborted', { cause: error });
      }
      throw new MiniCozeNetworkError('Network stream request failed', {
        cause: error,
      });
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  }

  #joinURL(path: string) {
    return `${this.#baseURL}/${path.replace(/^\/+/, '')}`;
  }

  #createHTTPError(response: Response, payload: unknown, cause?: unknown) {
    const details = extractErrorDetails(payload);
    const traceId = response.headers.get('x-trace-id')
      ?? response.headers.get('traceparent')
      ?? undefined;
    const message = details.message
      ? this.#redact(details.message)
      : `HTTP request failed with status ${response.status}`;

    return new MiniCozeHTTPError(message, {
      httpStatus: response.status,
      errorCode: details.code ? this.#redact(details.code) : undefined,
      traceId,
      cause: cause ?? payload,
    });
  }

  #redact(value: string) {
    return value.replaceAll(this.#apiKey, '[REDACTED]');
  }
}
