export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface RuntimeAgentConfig {
  id: string;
  /** 草稿固定 0；发布后 >=1，由 AgentVersion 快照投影 */
  revision: number;
  name: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** 仅启用项；空绑定为 [] */
  knowledgeBaseIds: string[];
  /** 仅启用项；空绑定为 [] */
  pluginIds: string[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
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
  /** 即 CurrentUser.id */
  ownerId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** 单位待裁决：轮 or 条 */
  contextLimit: number;
  openingMessage?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  pluginBindings: AgentPluginBindingView[];
  knowledgeBaseBindings: KnowledgeBindingView[];
  workflowBindings: WorkflowBindingView[];
}
