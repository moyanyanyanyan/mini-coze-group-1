export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type AgentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type BindingPickerKind = 'plugin' | 'knowledge';

export interface AgentModelOption {
  value: string;
  label: string;
  maxOutputTokens: number;
  enabled: boolean;
  isDefault: boolean;
}

export interface AgentFormValues {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number;
  openingMessage: string;
}

export interface AgentDetailData {
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  pluginBindings: { id: string; pluginId: string; enabled: boolean }[];
  knowledgeBaseBindings: { knowledgeBaseId: string; enabled: boolean }[];
  workflowBindings: { enabled: boolean }[];
}

export interface KnowledgeBaseOption {
  id: string;
  name: string;
  description: string;
}

export interface PluginOption {
  pluginId: string;
  title: string;
  content: string;
}

export interface AgentVersionItem {
  id: string;
  version: number;
  createdAt: string;
}

export interface AgentVersionPreview {
  version: number;
  snapshot: Record<string, unknown>;
}

export interface AgentListItem {
  id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  pluginCount: number;
  knowledgeBaseCount: number;
}
