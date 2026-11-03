import type { Prisma } from '@prisma/client';
import { RuntimeAgentConfig, AgentDetail } from './types';
import type {
  AgentPluginBindingView,
  KnowledgeBindingView,
  WorkflowBindingView,
} from './types';

export function buildAgentConfig(agent: AgentDetail, revision = 0): RuntimeAgentConfig {
  return {
    id: agent.id,
    revision,
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    knowledgeBaseIds: agent.knowledgeBaseBindings
      .filter((b) => b.enabled)
      .map((b) => b.knowledgeBaseId),
    pluginIds: agent.pluginBindings.filter((b) => b.enabled).map((b) => b.pluginId),
  };
}

export function parseRuntimeAgentConfigSnapshot(
  snapshot: Prisma.JsonValue,
  expectedAgentId: string,
  expectedRevision: number,
): RuntimeAgentConfig | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }

  const value = snapshot as Record<string, unknown>;
  const isStringArray = (input: unknown): input is string[] => (
    Array.isArray(input) && input.every((item) => typeof item === 'string')
  );

  if (
    value.id !== expectedAgentId
    || value.revision !== expectedRevision
    || typeof value.name !== 'string'
    || !value.name
    || typeof value.systemPrompt !== 'string'
    || typeof value.model !== 'string'
    || !value.model
    || typeof value.temperature !== 'number'
    || !Number.isFinite(value.temperature)
    || typeof value.maxTokens !== 'number'
    || !Number.isInteger(value.maxTokens)
    || value.maxTokens <= 0
    || !isStringArray(value.knowledgeBaseIds)
    || !isStringArray(value.pluginIds)
  ) {
    return null;
  }

  return {
    id: value.id,
    revision: value.revision,
    name: value.name,
    systemPrompt: value.systemPrompt,
    model: value.model,
    temperature: value.temperature,
    maxTokens: value.maxTokens,
    knowledgeBaseIds: value.knowledgeBaseIds,
    pluginIds: value.pluginIds,
  };
}

export function toAgentDetail(
  agent: Prisma.AgentGetPayload<{
    include: {
      pluginBindings: true;
      knowledgeBaseBindings: true;
      workflowBindings: true;
    };
  }>,
): AgentDetail {
  return {
    id: agent.id,
    ownerId: agent.ownerId,
    name: agent.name,
    description: agent.description ?? undefined,
    avatarUrl: agent.avatarUrl ?? undefined,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    contextLimit: agent.contextLimit,
    openingMessage: agent.openingMessage ?? undefined,
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    pluginBindings: (agent.pluginBindings ?? []).map(toPluginBindingView),
    knowledgeBaseBindings: (agent.knowledgeBaseBindings ?? []).map(toKnowledgeBindingView),
    workflowBindings: (agent.workflowBindings ?? []).map(toWorkflowBindingView),
  };
}

function toPluginBindingView(b: {
  id: string;
  pluginId: string;
  enabled: boolean;
  autoInvoke: boolean;
  sortOrder: number;
  config: Prisma.JsonValue | null;
}): AgentPluginBindingView {
  return {
    id: b.id,
    pluginId: b.pluginId,
    enabled: b.enabled,
    autoInvoke: b.autoInvoke,
    sortOrder: b.sortOrder,
    config: (b.config as Record<string, unknown> | null) ?? undefined,
  };
}

function toKnowledgeBindingView(b: {
  id: string;
  knowledgeBaseId: string;
  enabled: boolean;
  config: Prisma.JsonValue | null;
}): KnowledgeBindingView {
  return {
    id: b.id,
    knowledgeBaseId: b.knowledgeBaseId,
    enabled: b.enabled,
    config: (b.config as { topK?: number; minScore?: number } | null) ?? undefined,
  };
}

function toWorkflowBindingView(b: {
  id: string;
  workflowId: string;
  enabled: boolean;
  sortOrder: number;
}): WorkflowBindingView {
  return {
    id: b.id,
    workflowId: b.workflowId,
    enabled: b.enabled,
    sortOrder: b.sortOrder,
  };
}
