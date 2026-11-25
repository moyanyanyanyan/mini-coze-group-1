export type ChatAttachmentStatus = 'PARSING' | 'READY' | 'FAILED';

/** 输入区与气泡共用的附件视图，只含展示需要的字段 */
export interface ChatAttachmentView {
  id: string;
  fileName: string;
  sourceType: string;
  byteSize: number;
  status: ChatAttachmentStatus;
  errorCode?: string | null;
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
}

export interface ChatConversationItem {
  id: string;
  title: string;
  updatedAt: string;
}
