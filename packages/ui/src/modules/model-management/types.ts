export type ModelProvider = 'deepseek' | 'siliconflow' | 'openai_compatible';

export const providerLabels: Record<ModelProvider, string> = {
  deepseek: 'DeepSeek',
  siliconflow: '硅基流动',
  openai_compatible: 'OpenAI 兼容',
};

export const providerOptions: Array<{ value: ModelProvider; label: string }> = [
  { value: 'deepseek', label: providerLabels.deepseek },
  { value: 'siliconflow', label: providerLabels.siliconflow },
  { value: 'openai_compatible', label: providerLabels.openai_compatible },
];

export interface ModelListItem {
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

export interface ModelFormValues {
  key: string;
  displayName: string;
  description: string;
  provider: ModelProvider;
  upstreamModel: string;
  contextWindow: string;
  maxOutputTokens: string;
  supportsVision: boolean;
  enabled: boolean;
  sortOrder: string;
}

export type ModelFormErrors = Partial<Record<keyof ModelFormValues, string>>;
