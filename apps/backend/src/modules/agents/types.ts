export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface CurrentUserPayload {
  id: string;
}

export interface RuntimeModelConnection {
  protocol: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface RuntimeAgentConfig {
  id: string;
  revision: number;
  contextLimit?: number;
  name: string;
  systemPrompt: string;
  model: string;
  /** 绑定的模型配置 ID；发布快照只保存 ID，不保存凭据。 */
  modelConfigId?: string;
  /** 运行时临时组装的连接信息，含 Key，禁止落库或打日志。 */
  connection?: RuntimeModelConnection;
  temperature: number;
  maxTokens: number;
  knowledgeBaseIds: string[];
  pluginIds: string[];
}

export interface PublicAgentConfig {
  agentId: string;
  ownerId: string;
  status: AgentStatus;
  config: RuntimeAgentConfig;
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
  modelConfigId: string | null;
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
