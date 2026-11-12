import type { ModelConfig } from '@prisma/client';

export type ModelProvider = 'deepseek' | 'siliconflow' | 'openai_compatible';

export const MODEL_PROVIDERS: ModelProvider[] = ['deepseek', 'siliconflow', 'openai_compatible'];

export interface ModelRuntimeDescriptor {
  provider: ModelProvider;
  upstreamModel: string;
}

export interface ModelSummary {
  key: string;
  displayName: string;
  description?: string;
  provider: ModelProvider;
  upstreamModel: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  usageCount: number;
}

export interface AvailableModel {
  key: string;
  upstreamModel: string;
  provider: ModelProvider;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
}

export function toModelSummary(model: ModelConfig, usageCount = 0): ModelSummary {
  return {
    key: model.key,
    displayName: model.displayName,
    description: model.description ?? undefined,
    provider: toModelProvider(model.provider),
    upstreamModel: model.upstreamModel,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    supportsVision: model.supportsVision,
    enabled: model.enabled,
    isDefault: model.isDefault,
    sortOrder: model.sortOrder,
    usageCount,
  };
}

export function toAvailableModel(model: ModelConfig): AvailableModel {
  return {
    key: model.key,
    upstreamModel: model.upstreamModel,
    provider: toModelProvider(model.provider),
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    supportsVision: model.supportsVision,
  };
}

export function toModelProvider(value: string): ModelProvider {
  return MODEL_PROVIDERS.includes(value as ModelProvider)
    ? (value as ModelProvider)
    : 'openai_compatible';
}
