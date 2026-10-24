/**
 * Agent 域契约类型。
 * 落点 packages/shared/src/agent.ts，在 src/index.ts 中 re-export。
 * RuntimeAgentConfig 的字段集已由协作定稿冻结，AgentDetail 为前端与详情接口的域模型。
 */

export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/**
 * Runtime 协作定稿冻结的精简配置。
 * 仅此结构允许进入 POST /internal/runtime/run 的 agentConfig 字段。
 * 不含 tools / contextLimit / workflowBindings / 逐绑定 topK、minScore。
 */
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

/** 插件工具定义（OpenAI function 形态）。由 Runtime 用 pluginIds 调工具目录获取，不随 AgentConfig 传递。 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/** 插件绑定视图（前端与详情接口使用） */
export interface AgentPluginBindingView {
  id: string;
  pluginId: string;
  enabled: boolean;
  autoInvoke: boolean;
  sortOrder: number;
  config?: Record<string, unknown> | null;
}

/** 知识库绑定视图。config 仅存储，不进入 RuntimeAgentConfig */
export interface KnowledgeBindingView {
  id: string;
  knowledgeBaseId: string;
  enabled: boolean;
  config?: { topK?: number; minScore?: number } | null;
}

/** 工作流绑定视图 */
export interface WorkflowBindingView {
  id: string;
  workflowId: string;
  enabled: boolean;
  sortOrder: number;
}

/** Agent 详情域模型：前端渲染与详情接口使用，不发给 Runtime */
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
