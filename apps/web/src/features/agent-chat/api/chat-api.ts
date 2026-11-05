import type {
  ChatMessage,
  ConversationSummary,
  SendMessageResult,
} from '@minicoze/shared';
import { ApiError, API_BASE, del, get, post } from '../../../shared/api/http';

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

export interface StreamHandlers {
  /** 第一个事件，拿到本轮 assistant 消息 id */
  onStarted?: (assistantMessageId: string) => void;
  /** 每个增量片段，直接往气泡后面拼 */
  onDelta: (chunk: string) => void;
  onKnowledge?: (status: string, citations: ChatCitation[]) => void;
  /** 正常结束，data.content 是全量最终文本（以它为准，比拼 delta 更可靠） */
  onCompleted?: (content: string) => void;
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
      handlers.onCompleted?.(String(event.data.content ?? ''));
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

/**
 * 发一条消息并消费 SSE 流。
 * 传 signal 就能实现「停止生成」,abort 后 fetch 抛 AbortError，后端也跟着断。
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/conversations/${conversationId}/messages/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      // HttpOnly Cookie 靠它带上，漏了就是 401
      credentials: 'include',
      body: JSON.stringify({ content }),
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
