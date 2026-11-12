import type { AgentModelOption } from '@minicoze/ui/agent-builder';
import { listModels } from '../model-management/model.api';

export const FALLBACK_MODEL: AgentModelOption = {
  value: 'deepseek-ai/DeepSeek-V4.1-Flash',
  label: 'DeepSeek V4.1 Flash',
  maxOutputTokens: 8192,
  enabled: true,
  isDefault: true,
};

export interface AgentModelLoadResult {
  options: AgentModelOption[];
  error: string | null;
}

export async function loadAgentModels(): Promise<AgentModelLoadResult> {
  try {
    const { items } = await listModels(true);
    const enabled = items.filter((model) => model.enabled);
    if (enabled.length === 0) {
      return { options: [FALLBACK_MODEL], error: '暂无启用中的模型，已回退到默认模型' };
    }
    return {
      options: enabled.map((model) => ({
        value: model.key,
        label: model.displayName,
        maxOutputTokens: model.maxOutputTokens,
        enabled: true,
        isDefault: model.isDefault,
      })),
      error: null,
    };
  } catch {
    return { options: [FALLBACK_MODEL], error: '模型列表加载失败，已回退到默认模型' };
  }
}

export function defaultModelKey(options: AgentModelOption[]): string {
  const preferred =
    options.find((option) => option.isDefault && option.enabled) ??
    options.find((option) => option.enabled) ??
    options[0];
  return preferred?.value ?? FALLBACK_MODEL.value;
}
