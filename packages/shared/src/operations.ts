export interface OperationsPageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  asOf: string;
}

export interface OperationsRuntimeRun {
  question?: string;
  answer?: string;
  conversationTitle?: string;
  id: string;
  agentId: string;
  conversationId: string;
  assistantMessageId: string;
  mode: string;
  model: string;
  status: string;
  messageStatus: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  firstTokenMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorCode: string | null;
  truncated: boolean;
}

export interface OperationsRuntimeDetail extends OperationsRuntimeRun {
  events: { type: string; observedAt: string; data: unknown }[];
  asOf: string;
}

export interface OperationsRuntimeStats {
  total: number;
  running: number;
  reported: number;
  missingUsage: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  peakTokens: number | null;
  averageDurationMs: number | null;
  asOf: string;
}

export interface OperationsOverview {
  agents: number;
  conversations: number;
  knowledgeBases: number;
  documents: number;
  processingDocuments: number;
  failedDocuments: number;
  asOf: string;
}

export interface OperationsAgent {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  updatedAt: string;
  conversationCount: number;
}

export interface OperationsConversation {
  id: string;
  agentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsMessage {
  id: string;
  role: string;
  status: string;
  seq: number;
  content: string;
  createdAt: string;
}

export interface OperationsBase {
  createdAt?: string;
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'DISABLED';
  updatedAt: string;
  documentCount: number;
  availableChunkCount: number;
  processingDocuments: number;
  failedDocuments: number;
}

export interface OperationsDocument {
  attempts?: { recordedCount: number; latestSource: string; latestStatus: string };
  sourceSize?: number | null;
  id: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: string;
  originalFileName: string | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  stage: string;
  chunkCount: number;
  error: { code: string; message: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsChunk {
  id: string;
  position: number;
  content: string;
  startOffset: number;
  endOffset: number;
  enabled: boolean;
}

export type OperationsConversations = OperationsPageResult<OperationsConversation> & {
  agent: Pick<OperationsAgent, 'id' | 'name'>;
};
export type OperationsMessages = OperationsPageResult<OperationsMessage> & {
  conversation: OperationsConversation;
};
export type OperationsDocuments = OperationsPageResult<OperationsDocument> & {
  base: Pick<OperationsBase, 'id' | 'name' | 'status'>;
};

export interface OperationsDocumentText { id: string; knowledgeBaseId: string; rawText: string | null; }

export interface OperationsDocumentAttempt {
  id: string;
  ordinal: number;
  source: string;
  status: string;
  stage: string;
  startedAt: string | null;
  finishedAt: string | null;
  capturedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  events: { stage: string; status: string; at: string; snapshot?: boolean }[];
}
