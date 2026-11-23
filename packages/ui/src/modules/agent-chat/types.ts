export interface ChatMessageView {
  id: string;
  role: string;
  status: string;
  content: string;
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
