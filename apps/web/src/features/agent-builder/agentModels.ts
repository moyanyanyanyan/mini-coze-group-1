import type { AgentModelOption } from '@minicoze/ui/agent-builder';

export const FALLBACK_MODEL: AgentModelOption = {
  value: 'deepseek-ai/DeepSeek-V4.1-Flash',
  label: 'DeepSeek V4.1 Flash',
  maxOutputTokens: 8192,
  enabled: true,
  isDefault: true,
};

const STATIC_MODELS: AgentModelOption[] = [
  FALLBACK_MODEL,
  {
    value: 'deepseek-ai/DeepSeek-V3.2',
    label: 'DeepSeek V3.2',
    maxOutputTokens: 8192,
    enabled: true,
    isDefault: false,
  },
  {
    value: 'deepseek-chat',
    label: 'DeepSeek Chat',
    maxOutputTokens: 8192,
    enabled: true,
    isDefault: false,
  },
];

export interface AgentModelLoadResult {
  options: AgentModelOption[];
  error: string | null;
}

export async function loadAgentModels(): Promise<AgentModelLoadResult> {
  return { options: STATIC_MODELS, error: null };
}

export function defaultModelKey(options: AgentModelOption[]): string {
  const preferred =
    options.find((option) => option.isDefault && option.enabled) ??
    options.find((option) => option.enabled) ??
    options[0];
  return preferred?.value ?? FALLBACK_MODEL.value;
}
