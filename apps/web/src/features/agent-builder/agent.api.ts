export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export const modelOptions = [
  { value: 'deepseek-ai/DeepSeek-V4.1-Flash', label: 'DeepSeek V4.1 Flash (硅基流动)' },
  { value: 'deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2 (旧配置)' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat (旧配置)' },
];

export const contextLimitOptions = [0, 5, 10, 20, 50, 100];

export interface AgentPluginBinding {
  id: string;
  pluginId: string;
  enabled: boolean;
  autoInvoke: boolean;
  sortOrder: number;
  config?: Record<string, unknown> | null;
}

export interface AgentKnowledgeBinding {
  id: string;
  knowledgeBaseId: string;
  enabled: boolean;
  config?: { topK?: number; minScore?: number } | null;
}

export interface AgentWorkflowBinding {
  id: string;
  workflowId: string;
  enabled: boolean;
  sortOrder: number;
}

export interface Agent {
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
  pluginBindings: AgentPluginBinding[];
  knowledgeBaseBindings: AgentKnowledgeBinding[];
  workflowBindings: AgentWorkflowBinding[];
}

export interface KnowledgeBaseSummary {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface PluginSummary {
  pluginId: string;
  title: string;
  content: string;
}

export interface AgentListResponse {
  items: Agent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  avatarUrl?: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextLimit?: number;
  openingMessage?: string;
}

export interface UpdateAgentInput {
  status?: AgentStatus;
  name?: string;
  description?: string;
  avatarUrl?: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextLimit?: number;
  openingMessage?: string;
}

export interface ReplaceKnowledgeBindingsInput {
  knowledgeBaseIds: string[];
}

export interface ReplacePluginBindingsInput {
  pluginIds: string[];
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function getCurrentUserId(): Promise<string> {
  const response = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
  if (response.ok) {
    const user = await response.json() as { id: string };
    return user.id;
  }
  if (import.meta.env.DEV && response.status === 401) return 'ws-local-demo';
  throw new Error('请先登录');
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiEnvelope<T> | { message?: string | string[] };
  if (!response.ok || !('code' in body) || body.code !== response.status) {
    const message = body.message;
    throw new Error(Array.isArray(message) ? message.join('；') : message || '请求失败');
  }
  return body.data;
}

export async function listAgents(): Promise<AgentListResponse> {
  const response = await fetch(`${API_BASE}/api/agents`, { credentials: 'include' });
  return readResponse<AgentListResponse>(response);
}

export async function getAgent(agentId: string): Promise<Agent> {
  const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}`, { credentials: 'include' });
  return readResponse<Agent>(response);
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const response = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<Agent>(response);
}

export async function updateAgent(agentId: string, input: UpdateAgentInput): Promise<Agent> {
  const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<Agent>(response);
}

export async function deleteAgent(agentId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await readResponse<null>(response);
}

export async function replaceKnowledgeBindings(agentId: string, input: ReplaceKnowledgeBindingsInput): Promise<AgentKnowledgeBinding[]> {
  const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}/knowledge-bases`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bindings: input.knowledgeBaseIds.map((knowledgeBaseId) => ({ knowledgeBaseId, enabled: true })) }),
  });
  return readResponse<AgentKnowledgeBinding[]>(response);
}

export async function replacePluginBindings(agentId: string, input: ReplacePluginBindingsInput): Promise<AgentPluginBinding[]> {
  const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}/plugins`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<AgentPluginBinding[]>(response);
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseSummary[]> {
  const workspaceId = await getCurrentUserId();
  const response = await fetch(`${API_BASE}/api/knowledge-bases?workspaceId=${encodeURIComponent(workspaceId)}`, {
    credentials: 'include',
  });
  return readResponse<KnowledgeBaseSummary[]>(response);
}

// TODO: 插件目录真实接口（需插件模块推送 findByIds 或 listCatalog 端点）
export async function listPlugins(): Promise<PluginSummary[]> {
  const response = await fetch(`${API_BASE}/api/plugins`, { credentials: 'include' });
  return readResponse<PluginSummary[]>(response);
}
