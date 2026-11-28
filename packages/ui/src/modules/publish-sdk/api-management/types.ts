export interface ApiKeyRecord {
  id: string;
  agentId: string;
  agentName: string;
  name: string;
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiKeyAgentOption {
  id: string;
  name: string;
}

export type ApiKeyListStatus = 'loading' | 'ready' | 'error';
