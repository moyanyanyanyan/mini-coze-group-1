import type { AgentModelOption } from '@minicoze/ui/agent-builder';
import { listChatModelOptions } from './agent.api';

export const FALLBACK_MODEL: AgentModelOption = {
  value: '',
  label: '暂无可用模型，请先在「模型管理」中添加',
  maxOutputTokens: 8192,
  enabled: false,
  isDefault: false,
};

export interface AgentModelLoadResult {
  options: AgentModelOption[];
  error: string | null;
}

/**
 * 新建/编辑 Agent 时只能绑定「已启用」的对话模型配置。
 * 下拉框的 value 为模型配置 ID（modelConfigId），不再直接传模型 key。
 */
export async function loadAgentModels(): Promise<AgentModelLoadResult> {
  try {
    const configs = await listChatModelOptions();
    const options: AgentModelOption[] = configs.map((config, index) => ({
      value: config.id,
      label: config.name ? `${config.name}（${config.modelIdentifier}）` : config.modelIdentifier,
      maxOutputTokens: 8192,
      enabled: true,
      isDefault: index === 0,
    }));
    return { options, error: options.length === 0 ? '暂无可用模型，请先在「模型管理」中添加' : null };
  } catch (err) {
    return {
      options: [FALLBACK_MODEL],
      error: err instanceof Error ? err.message : '加载模型列表失败',
    };
  }
}

export function defaultModelKey(options: AgentModelOption[]): string {
  const preferred =
    options.find((option) => option.isDefault && option.enabled) ??
    options.find((option) => option.enabled) ??
    options[0];
  return preferred?.value ?? '';
}
