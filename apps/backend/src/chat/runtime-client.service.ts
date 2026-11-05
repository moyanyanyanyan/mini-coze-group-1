import { Injectable, Logger } from '@nestjs/common';

// 智能体配置
export interface RuntimeAgentConfig {
  id: string;
  revision: number;
  name: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  knowledgeBaseIds: string[];
  pluginIds: string[];
}

// 历史消息
export interface RuntimeHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// 完成请求体
export interface RuntimeRequestBody {
  runId: string;
  actor: { id: string };
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  agentConfig: RuntimeAgentConfig;
  history: RuntimeHistoryMessage[];
  message: string;
}

// Runtime返回的事件
export interface RuntimeSseEvent {
  runId: string;
  conversationId: string;
  seq: number;
  timestamp: string;
  type:
    | 'run.started'
    | 'knowledge.result'
    | 'message.delta'
    | 'tool.started'
    | 'tool.completed'
    | 'run.completed'
    | 'run.failed';
  data: Record<string, unknown>;
}

export interface RuntimeUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RuntimeCitation {
  knowledgeBaseId: string;
  documentId: string;
  chunkId: string;
  title: string;
  position?: Record<string, unknown> | null;
}

export type RuntimeToolResult =
  | {
      toolCallId: string;
      toolName: string;
      status: 'succeeded';
      output: unknown;
    }
  | {
      toolCallId: string;
      toolName: string;
      status: 'failed';
      error: Record<string, string>;
    };

export interface RuntimeResult {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  status: 'completed';
  content: string;
  finishReason: 'stop' | 'length';
  usage?: RuntimeUsage | null;
  citations: RuntimeCitation[];
  toolResults: RuntimeToolResult[];
}

export type RuntimeCallErrorKind =
  | 'runtime'
  | 'http'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'configuration';

// 自定义错误类
export class RuntimeCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly options: {
      kind?: RuntimeCallErrorKind;
      httpStatus?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'RuntimeCallError';
  }
}

const RUNTIME_RUN_TIMEOUT_MS = 190_000;
const RUNTIME_STREAM_TIMEOUT_MS = 190_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRuntimeResult(value: unknown): value is RuntimeResult {
  if (!isRecord(value)) return false;
  const usage = value.usage;
  return (
    typeof value.runId === 'string'
    && typeof value.conversationId === 'string'
    && typeof value.assistantMessageId === 'string'
    && value.status === 'completed'
    && typeof value.content === 'string'
    && (value.finishReason === 'stop' || value.finishReason === 'length')
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

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function parseRuntimeEvent(
  dataText: string,
  eventType: string,
  eventId: string,
): RuntimeSseEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataText);
  } catch (error) {
    throw new RuntimeCallError(
      'MODEL_PROTOCOL_ERROR',
      'Runtime 返回了无效的 SSE JSON',
      { kind: 'http', cause: error },
    );
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
  ) {
    throw new RuntimeCallError(
      'MODEL_PROTOCOL_ERROR',
      'Runtime SSE 事件结构不符合约定',
      { kind: 'http' },
    );
  }

  if (eventType && eventType !== parsed.type) {
    throw new RuntimeCallError(
      'MODEL_PROTOCOL_ERROR',
      'Runtime SSE event 头与事件类型不一致',
      { kind: 'http' },
    );
  }

  if (eventId && eventId !== `${parsed.runId}:${parsed.seq}`) {
    throw new RuntimeCallError(
      'MODEL_PROTOCOL_ERROR',
      'Runtime SSE id 与事件标识不一致',
      { kind: 'http' },
    );
  }

  return parsed as unknown as RuntimeSseEvent;
}

class RuntimeEventParser {
  #buffer = '';
  #eventType = '';
  #dataLines: string[] = [];
  #eventId = '';

  push(chunk: string): RuntimeSseEvent[] {
    if (!chunk) return [];

    const events: RuntimeSseEvent[] = [];
    this.#buffer += chunk;
    let cursor = 0;

    while (cursor < this.#buffer.length) {
      let lineEnd = -1;
      let lineBreakLength = 1;

      for (let index = cursor; index < this.#buffer.length; index += 1) {
        const character = this.#buffer[index];
        if (character === '\n') {
          lineEnd = index;
          break;
        }
        if (character === '\r') {
          if (index === this.#buffer.length - 1) break;
          lineEnd = index;
          lineBreakLength = this.#buffer[index + 1] === '\n' ? 2 : 1;
          break;
        }
      }

      if (lineEnd === -1) break;

      this.#processLine(this.#buffer.slice(cursor, lineEnd), events);
      cursor = lineEnd + lineBreakLength;
    }

    this.#buffer = this.#buffer.slice(cursor);
    return events;
  }

  finish(): RuntimeSseEvent[] {
    const events: RuntimeSseEvent[] = [];
    if (this.#buffer === '\r') this.#processLine('', events);
    this.#buffer = '';
    this.#eventType = '';
    this.#dataLines = [];
    this.#eventId = '';
    return events;
  }

  #processLine(line: string, events: RuntimeSseEvent[]) {
    if (!line) {
      if (this.#dataLines.length > 0) {
        events.push(parseRuntimeEvent(
          this.#dataLines.join('\n'),
          this.#eventType,
          this.#eventId,
        ));
      }
      this.#eventType = '';
      this.#dataLines = [];
      this.#eventId = '';
      return;
    }

    if (line.startsWith(':')) return;

    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') {
      this.#eventType = value;
    } else if (field === 'data') {
      this.#dataLines.push(value);
    } else if (field === 'id' && !value.includes('\0')) {
      this.#eventId = value;
    }
  }
}


@Injectable()
export class RuntimeClientService {

    // logger是nestjs提供的日志工具
  private readonly logger = new Logger(RuntimeClientService.name);

  // 切 mock / 切真身只改这个环境变量
  private readonly baseUrl = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000';
  private readonly token = process.env.INTERNAL_SERVICE_TOKEN ?? '';

  async run(
    request: RuntimeRequestBody,
    signal?: AbortSignal,
  ): Promise<RuntimeResult> {
    if (!this.token) {
      throw new RuntimeCallError(
        'INTERNAL_NOT_CONFIGURED',
        'Runtime 内部服务凭证未配置',
        { kind: 'configuration' },
      );
    }

    if (signal?.aborted) {
      throw new RuntimeCallError(
        'REQUEST_ABORTED',
        'Runtime 请求已取消',
        { kind: 'aborted', cause: signal.reason },
      );
    }

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal?.reason);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('Runtime request timed out', 'TimeoutError'));
    }, RUNTIME_RUN_TIMEOUT_MS);

    signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const response = await fetch(`${this.baseUrl}/internal/runtime/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await this.toCallError(response);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new RuntimeCallError(
          'RUNTIME_PROTOCOL_ERROR',
          'Runtime 返回了无效的 JSON 响应',
          { kind: 'http', httpStatus: response.status, cause: error },
        );
      }

      if (!isRuntimeResult(payload)) {
        throw new RuntimeCallError(
          'RUNTIME_PROTOCOL_ERROR',
          'Runtime 返回结构不符合约定',
          { kind: 'http', httpStatus: response.status },
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof RuntimeCallError) {
        throw error;
      }

      if (timedOut) {
        throw new RuntimeCallError(
          'RUNTIME_TIMEOUT',
          'Runtime 请求超时',
          { kind: 'timeout', cause: error },
        );
      }

      if (signal?.aborted || isAbortLikeError(error)) {
        throw new RuntimeCallError(
          'REQUEST_ABORTED',
          'Runtime 请求已取消',
          { kind: 'aborted', cause: signal?.reason ?? error },
        );
      }

      throw new RuntimeCallError(
        'RUNTIME_UNAVAILABLE',
        'Runtime 网络请求失败',
        { kind: 'network', cause: error },
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  /**
   * 请求 Runtime 的流式端点，逐个 yield 解析后的事件。
   * 调用方传 AbortSignal 就能实现「停止生成」（C4）。
   */

  //   “*”定义异步生成器函数
  async *stream(
    request: RuntimeRequestBody,
    signal?: AbortSignal,
  ): AsyncGenerator<RuntimeSseEvent> {
    if (!this.token) {
      throw new RuntimeCallError(
        'INTERNAL_NOT_CONFIGURED',
        'Runtime 内部服务凭证未配置',
        { kind: 'configuration' },
      );
    }

    if (signal?.aborted) {
      throw new RuntimeCallError(
        'REQUEST_ABORTED',
        'Runtime 请求已取消',
        { kind: 'aborted', cause: signal.reason },
      );
    }

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal?.reason);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('Runtime stream timed out', 'TimeoutError'));
    }, RUNTIME_STREAM_TIMEOUT_MS);
    signal?.addEventListener('abort', forwardAbort, { once: true });

    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let completed = false;
    const decoder = new TextDecoder('utf-8');
    const parser = new RuntimeEventParser();

    try {
      response = await fetch(`${this.baseUrl}/internal/runtime/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) throw await this.toCallError(response);
      if (!response.body) {
        throw new RuntimeCallError(
          'MODEL_STREAM_INTERRUPTED',
          'Runtime 没有返回流式响应体',
          { kind: 'http', httpStatus: response.status },
        );
      }

      reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          completed = true;
          break;
        }

        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          yield event;
        }
      }

      const tail = decoder.decode();
      for (const event of parser.push(tail)) {
        yield event;
      }
      for (const event of parser.finish()) {
        yield event;
      }
    } catch (error) {
      if (error instanceof RuntimeCallError) throw error;
      if (timedOut) {
        throw new RuntimeCallError(
          'RUN_TIMEOUT',
          'Runtime 流式请求超时',
          { kind: 'timeout', cause: error },
        );
      }
      if (signal?.aborted || isAbortLikeError(error)) {
        throw new RuntimeCallError(
          'REQUEST_ABORTED',
          'Runtime 请求已取消',
          { kind: 'aborted', cause: signal?.reason ?? error },
        );
      }
      // 尚未收到响应时属于连接失败；收到响应后的读取异常属于流中断。
      if (!response) {
        this.logger.warn('无法连接 Runtime 服务');
        throw new RuntimeCallError(
          'RUNTIME_UNAVAILABLE',
          '模型服务暂时不可用，请稍后重试',
          { kind: 'network', cause: error },
        );
      }
      throw new RuntimeCallError(
        'MODEL_STREAM_INTERRUPTED',
        'Runtime 流式响应中断',
        { kind: 'network', cause: error },
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
      if (!completed) {
        await reader?.cancel(controller.signal.reason).catch(() => undefined);
      }
      reader?.releaseLock();
    }
  }

/** 把 HTTP 失败翻译成带 code 的错误。他的 code 在响应头，不在 body */
  private async toCallError(response: Response): Promise<RuntimeCallError> {
    const headerCode = response.headers.get('x-runtime-error-code') ?? '';

    let bodyMessage = '';
    try {
      const payload = (await response.json()) as { message?: string };
      bodyMessage = payload.message ?? '';
    } catch {
      // body 不是 JSON 就算了
    }

    // 401/503 对用户来说都是「Runtime 用不了」，不该让前端以为是自己掉登录
    const code =
      headerCode ||
      (response.status === 401 ? 'INTERNAL_UNAUTHORIZED' : 'RUNTIME_UNAVAILABLE');

    this.logger.warn(`Runtime 调用失败 status=${response.status} code=${code}`);

    const message = (bodyMessage || `Runtime 返回 ${response.status}`)
      .replaceAll(this.token, '[REDACTED]');

    return new RuntimeCallError(code, message, {
      kind: headerCode ? 'runtime' : 'http',
      httpStatus: response.status,
    });
  }
}
