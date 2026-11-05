export interface MiniCozeClientOptions {
  /** Base URL of the MiniCoze public API. Must use HTTP or HTTPS. */
  baseURL: string;
  /** API key used to authenticate public API requests. */
  apiKey: string;
  /** Request timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
}

export interface RunParams {
  message: string;
  conversationId?: string;
}

export interface RunUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RunResult {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  status: 'completed';
  content: string;
  finishReason: string;
  usage?: RunUsage | null;
  citations: unknown[];
  toolResults: unknown[];
}

export interface RunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type StreamOptions = RunOptions;

export interface RunCitation {
  knowledgeBaseId: string;
  documentId: string;
  chunkId: string;
  title: string;
  position?: Record<string, unknown> | null;
}

interface RunStreamEventBase {
  runId: string;
  conversationId: string;
  seq: number;
  timestamp: string;
  sseId: string;
}

export type RunStreamEvent =
  | (RunStreamEventBase & {
      type: 'run.started';
      data: { assistantMessageId: string };
    })
  | (RunStreamEventBase & {
      type: 'knowledge.result';
      data: {
        status: 'matched' | 'no_match';
        citations: RunCitation[];
      };
    })
  | (RunStreamEventBase & {
      type: 'message.delta';
      data: { content: string };
    })
  | (RunStreamEventBase & {
      type: 'tool.started';
      data: {
        toolCallId: string;
        toolName: string;
      };
    })
  | (RunStreamEventBase & {
      type: 'tool.completed';
      data:
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
    })
  | (RunStreamEventBase & {
      type: 'run.completed';
      data: RunResult;
    })
  | (RunStreamEventBase & {
      type: 'run.failed';
      data: {
        code: string;
        message: string;
        retryable: boolean;
      };
    });
