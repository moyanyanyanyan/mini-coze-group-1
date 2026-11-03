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

// SSE 帧之间的分隔就是两个换行，代表一帧SSE事件的结束
const FRAME_SEPARATOR = '\n\n';
const RUNTIME_RUN_TIMEOUT_MS = 190_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeResult(value: unknown): value is RuntimeResult {
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

// 把文本帧解析成事件对象，如果文本是心跳或者无效数据返回null
function parseFrame(raw: string): RuntimeSseEvent | null {
  let dataText = '';

  for (const line of raw.split('\n')) {
    // raw.split('\n') 把一帧中的每一行拆开，方便逐行检查

    // 跳过注释行，‘：’开头的一般为注释，常用于发送心跳  ：heartbeat
    if (line.startsWith(':')) {
      continue;
    }
    // id: 和 event: 行我们不用，type 在 data 的信封里已经有了
    if (!line.startsWith('data:')) {
      continue;
    }
    // SSE 规范：data: 后面可能跟一个空格，也可能多行 data 拼起来
    dataText += line.slice(5).replace(/^ /, '');
  }

  if (!dataText) {
    return null;
  }
  try {
    const parsed = JSON.parse(dataText) as RuntimeSseEvent;
    return typeof parsed?.type === 'string' ? parsed : null;
  } catch {
    return null;
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
    signal: AbortSignal,
  ): AsyncGenerator<RuntimeSseEvent> {
    const response = await fetch(`${this.baseUrl}/internal/runtime/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) {
      throw await this.toCallError(response);
    }

    if (!response.body) {
      throw new RuntimeCallError(
        'RUNTIME_UNAVAILABLE',
        'Runtime 没有返回流式响应体'
      );
    }

    // 读取流式数据
    // 读取响应流
    const reader = response.body.getReader();
    // 把utf-8解码成文本
    const decoder = new TextDecoder('utf-8');
    // 暂存没组成完成事件的文本
    let buffer = '';

    try {
      // 持续读取
      while (true) {
        // done：流是否已经结束
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        // 不完整的字节留在解码器内部，下一块拼上再吐出来
        buffer += decoder.decode(value, { stream: true });

        // 流式解析的核心
        let boundary = buffer.indexOf(FRAME_SEPARATOR);
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + FRAME_SEPARATOR.length);

          const event = parseFrame(raw);
          if (event) {
            yield event;
          }

          boundary = buffer.indexOf(FRAME_SEPARATOR);
        }
      }


      // 收尾：把解码器里残留的半个字符吐完
      buffer += decoder.decode();
      if (buffer.trim()) {
        const event = parseFrame(buffer);
        if (event) {
          yield event;
        }
      }
    } finally {
      // 调用方中途 break（停止生成）时，这里要把上游连接放开
      try {
        reader.releaseLock();
      } catch {
        // 已经释放过了，忽略
      }
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
