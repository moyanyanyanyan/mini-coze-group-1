export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface CurrentUserPayload {
  id: string;
}

export interface RuntimeAgentConfig {
  id: string;
  revision: number;
  name: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  knowledgeBaseIds: string[];
  pluginIds: string[];
}

export interface AgentPluginBindingView {
  id: string;
  pluginId: string;
  enabled: boolean;
  autoInvoke: boolean;
  sortOrder: number;
  config?: Record<string, unknown> | null;
}

export interface KnowledgeBindingView {
  id: string;
  knowledgeBaseId: string;
  enabled: boolean;
  config?: { topK?: number; minScore?: number } | null;
}

export interface WorkflowBindingView {
  id: string;
  workflowId: string;
  enabled: boolean;
  sortOrder: number;
}

export interface AgentDetail {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number;
  openingMessage?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  pluginBindings: AgentPluginBindingView[];
  knowledgeBaseBindings: KnowledgeBindingView[];
  workflowBindings: WorkflowBindingView[];
}
