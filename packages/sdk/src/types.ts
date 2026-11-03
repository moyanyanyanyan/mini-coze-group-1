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
