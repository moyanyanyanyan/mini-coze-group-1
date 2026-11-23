export interface ApiKey {
  id: string;
  agentId: string;
  agentName: string;
  name: string;
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedApiKey {
  apiKey: ApiKey;
  secret: string;
}

export interface AgentOption {
  id: string;
  name: string;
}
