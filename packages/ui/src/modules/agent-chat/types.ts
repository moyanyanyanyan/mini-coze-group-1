export type ChatAttachmentStatus = 'PARSING' | 'READY' | 'FAILED';

/** 输入区与气泡共用的附件视图，只含展示需要的字段 */
export interface ChatAttachmentView {
  id: string;
  fileName: string;
  sourceType: string;
  byteSize: number;
  status: ChatAttachmentStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export type ComposerAttachment = ChatAttachmentView;

export interface ChatMessageView {
  id: string;
  role: string;
  status: string;
  content: string;
  attachments?: ChatAttachmentView[];
}

export interface ChatAgentOption {
  id: string;
  name: string;
  avatarUrl?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export interface ChatConversationItem {
  id: string;
  title: string;
  agentId: string | null;
  updatedAt: string;
  createdAt?: string;
}

export interface ConversationMemoryData {
  summary?: string;
  compressionPending?: boolean;
  conversationId: string;
  systemPrompt: string;
  configuredTurns: number;
  effectiveTurns: number;
  retainedTurns: number;
  availableTurns: number;
  tokenLimit: number;
  estimatedInputTokens: number;
  reservedOutputTokens: number;
  remainingTokens: number;
  droppedTurns: number;
  history: { id: string; role: 'user' | 'assistant'; content: string }[];
  asOf: string;
}
