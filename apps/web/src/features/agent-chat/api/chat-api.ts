import type {
  ChatMessage,
  ConversationSummary,
  SendMessageResult,
} from '@minicoze/shared';
import { ApiError, API_BASE, del, get, patch, post } from '../../../shared/api/http';

export function listConversations() {
  return get<ConversationSummary[]>('/api/conversations');
}

export function createConversation(agentId: string) {
  return post<ConversationSummary>('/api/conversations', { agentId });
}

export function listMessages(conversationId: string) {
  return get<ChatMessage[]>(`/api/conversations/${conversationId}/messages`);
}

/** B3 的非流式接口，留着做主备；聊天页用下面的 streamMessage */
export function sendMessage(conversationId: string, content: string) {
  return post<SendMessageResult>(`/api/conversations/${conversationId}/messages`, { content });
}

export function deleteConversation(conversationId: string) {
  return del<void>(`/api/conversations/${conversationId}`);
}

/** 上传接口（ResponseInterceptor 包了 code/message/data 信封）返回的附件元信息 */
export interface PendingAttachment {
  id: string;
  fileName: string;
  sourceType: string;
  byteSize: number;
  status: 'PARSING' | 'READY' | 'FAILED';
  errorCode?: string | null;
}

interface AttachmentUploadResult {
  id: string;
  fileName: string;
  mimeType: string;
  sourceType: string;
  byteSize: number;
  status: 'PARSING' | 'READY' | 'FAILED';
  textBytes: number;
  preview: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * 一次传一个文件，上传即解析。
 * HTTP 失败（类型/大小/magic bytes）抛 ApiError；解析失败仍返回 202，
 * 由调用方展示 FAILED 状态的 chip。
 */
export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<AttachmentUploadResult> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(
    `${API_BASE}/api/conversations/${conversationId}/attachments`,
    {
      method: 'POST',
      credentials: 'include',
      body: form,
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | ({ code?: string; message?: string | string[] } & Partial<Envelope<AttachmentUploadResult>>)
    | null;

  if (!response.ok) {
    const rawMessage = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;
    throw new ApiError(
      response.status,
      payload?.code ?? 'UNKNOWN',
      rawMessage ?? '附件上传失败，请稍后再试',
    );
  }
  if (!payload?.data) {
    throw new ApiError(500, 'INVALID_RESPONSE', '附件上传响应格式无效');
  }
  return payload.data;
}

export function renameConversation(conversationId: string, title: string) {
  return patch<ConversationSummary>(`/api/conversations/${conversationId}`, { title });
}

// ---------- 流式 ----------

/** 后端 C3 下发的一帧。type 在 data 的信封里，和 event: 行一致 */
interface ChatStreamEvent {
  seq?: number;
  type: string;
  data: Record<string, unknown>;
}

export interface ChatCitation {
  knowledgeBaseId: string;
  documentId: string;
  chunkId: string;
  title: string;
  position?: { page?: number };
}

export interface StreamUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamHandlers {
  onConnected?: () => void;
  /** 第一个事件，拿到本轮 assistant 消息 id */
  onStarted?: (assistantMessageId: string) => void;
  /** 每个增量片段，直接往气泡后面拼 */
  onDelta: (chunk: string) => void;
  onKnowledge?: (status: string, citations: ChatCitation[]) => void;
  /** 正常结束，data.content 是全量最终文本（以它为准，比拼 delta 更可靠） */
  onCompleted?: (content: string, usage?: StreamUsage) => void;
  /** code 已被后端脱敏成 MODEL_ERROR / MODEL_TIMEOUT / PERSISTENCE_FAILED */
  onFailed?: (code: string, message: string, retryable: boolean) => void;
}

/** 冒号开头一律当注释扔掉 */
function parseEventFrame(raw: string): ChatStreamEvent | null {
  let dataText = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) {
      continue;
    }
    if (!line.startsWith('data:')) {
      continue;
    }
    dataText += line.slice(5).replace(/^ /, '');
  }

  if (!dataText) {
    return null;
  }

  try {
    const parsed = JSON.parse(dataText) as ChatStreamEvent;
    return typeof parsed?.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function dispatch(event: ChatStreamEvent | null, handlers: StreamHandlers): void {
  if (!event) {
    return;
  }

  switch (event.type) {
    case 'run.started':
      handlers.onStarted?.(String(event.data.assistantMessageId ?? ''));
      break;
    case 'message.delta':
      handlers.onDelta(String(event.data.content ?? ''));
      break;
    case 'knowledge.result':
      handlers.onKnowledge?.(
        String(event.data.status ?? 'no_match'),
        Array.isArray(event.data.citations) ? event.data.citations as ChatCitation[] : [],
      );
      break;
    case 'run.completed':
      handlers.onCompleted?.(String(event.data.content ?? ''), parseUsage(event.data.usage));
      break;
    case 'run.failed':
      handlers.onFailed?.(
        String(event.data.code ?? 'MODEL_ERROR'),
        String(event.data.message ?? '生成失败，请稍后再试'),
        Boolean(event.data.retryable),
      );
      break;
    default:
      // tool.* 暂不展示
      break;
  }
}

function parseUsage(value: unknown): StreamUsage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const values = [usage.promptTokens, usage.completionTokens, usage.totalTokens];
  if (!values.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0)) return undefined;
  return {
    promptTokens: values[0] as number,
    completionTokens: values[1] as number,
    totalTokens: values[2] as number,
  };
}

/**
 * 发一条消息并消费 SSE 流。
 * 传 signal 就能实现「停止生成」,abort 后 fetch 抛 AbortError，后端也跟着断。
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  options?: { attachmentIds?: string[] },
): Promise<void> {
  const body = options?.attachmentIds?.length
    ? { content, attachmentIds: options.attachmentIds }
    : { content };
  const response = await fetch(
    `${API_BASE}/api/conversations/${conversationId}/messages/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      // HttpOnly Cookie 靠它带上，漏了就是 401
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { code?: string; message?: string | string[] }
      | null;
    const rawMessage = Array.isArray(payload?.message)
      ? payload.message[0]
      : payload?.message;
    throw new ApiError(
      response.status,
      payload?.code ?? 'UNKNOWN',
      rawMessage ?? '发送失败，请稍后再试',
    );
  }

  if (!response.body) {
    throw new ApiError(500, 'STREAM_UNAVAILABLE', '当前浏览器不支持流式响应');
  }

  handlers.onConnected?.();

  const reader = response.body.getReader();
  // 和后端 runtimeclientserver 同一个坑：不 stream: true，切在两块之间的汉字会变成 �
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        dispatch(parseEventFrame(raw), handlers);
        boundary = buffer.indexOf('\n\n');
      }
    }

    // 收尾：把解码器里残留的半个字符吐出来
    buffer += decoder.decode();
    if (buffer.trim()) {
      dispatch(parseEventFrame(buffer), handlers);
    }
  } finally {
    reader.releaseLock();
  }
}
