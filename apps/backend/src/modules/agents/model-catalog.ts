import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-codes';

export type ModelProvider = 'deepseek' | 'siliconflow' | 'openai_compatible';

export const MODEL_PROVIDERS: ModelProvider[] = ['deepseek', 'siliconflow', 'openai_compatible'];

export interface ModelRuntimeDescriptor {
  provider: ModelProvider;
  upstreamModel: string;
}

export interface ModelCatalogEntry {
  key: string;
  displayName: string;
  provider: ModelProvider;
  upstreamModel: string;
  maxOutputTokens: number;
  enabled: boolean;
  isDefault: boolean;
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    key: 'deepseek-ai/DeepSeek-V4.1-Flash',
    displayName: 'DeepSeek V4.1 Flash',
    provider: 'siliconflow',
    upstreamModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
    maxOutputTokens: 8192,
    enabled: true,
    isDefault: true,
  },
  {
    key: 'deepseek-ai/DeepSeek-V3.2',
    displayName: 'DeepSeek V3.2',
    provider: 'siliconflow',
    upstreamModel: 'deepseek-ai/DeepSeek-V3.2',
    maxOutputTokens: 8192,
    enabled: true,
    isDefault: false,
  },
  {
    key: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    provider: 'deepseek',
    upstreamModel: 'deepseek-chat',
    maxOutputTokens: 8192,
    enabled: true,
    isDefault: false,
  },
];

export const DEFAULT_MODEL_KEY = MODEL_CATALOG.find((model) => model.isDefault)?.key
  ?? MODEL_CATALOG[0].key;

export function toModelProvider(value: string): ModelProvider {
  return MODEL_PROVIDERS.includes(value as ModelProvider)
    ? (value as ModelProvider)
    : 'openai_compatible';
}

export function findModelConfig(key: string): ModelCatalogEntry | null {
  return MODEL_CATALOG.find((model) => model.key === key) ?? null;
}

export function toModelRuntimeDescriptor(key: string): ModelRuntimeDescriptor | null {
  const model = findModelConfig(key);
  return model ? { provider: model.provider, upstreamModel: model.upstreamModel } : null;
}

export function assertModelAvailable(key: string): void {
  const model = findModelConfig(key);
  if (!model || !model.enabled) {
    throw new BadRequestException({
      code: ErrorCode.MODEL_NOT_AVAILABLE,
      message: `模型 ${key} 不存在或已停用`,
    });
  }
}
