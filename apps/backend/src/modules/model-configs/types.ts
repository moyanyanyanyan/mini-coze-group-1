export const OPENAI_COMPATIBLE_PROTOCOL = 'openai_compatible';

export type ModelConfigType = 'CHAT' | 'EMBEDDING';

/** 服务商预置模型：选中后自动带出模型标识、类型与向量维度。 */
export interface ModelPreset {
  identifier: string;
  label: string;
  type: ModelConfigType;
  dimension?: number;
}

export interface ModelProviderView {
  id: string;
  name: string;
  protocol: string;
  defaultBaseUrl: string;
  builtinKey: string | null;
  modelCount: number;
  /** 内置服务商的预置模型；用户自建服务商为空数组，由用户手填模型标识。 */
  presetModels: ModelPreset[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigView {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  modelIdentifier: string;
  type: ModelConfigType;
  dimension: number | null;
  baseUrl: string | null;
  effectiveBaseUrl: string;
  maskedKey: string;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'OK' | 'FAILED' | null;
  lastTestLatencyMs: number | null;
  lastTestErrorType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedModelConnection {
  protocol: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  type: ModelConfigType;
  dimension: number | null;
}

export interface ModelTestResult {
  ok: boolean;
  latencyMs: number;
  errorType: string | null;
  dimension: number | null;
}

/**
 * 首期内置服务商；用户可再自行新增 OpenAI 兼容服务。
 * presets 只用于页面预填，最终以联调验收通过的模型名单为准。
 */
export const DEFAULT_MODEL_PROVIDERS: ReadonlyArray<{
  builtinKey: string;
  name: string;
  defaultBaseUrl: string;
  presets: ModelPreset[];
}> = [
  {
    builtinKey: 'deepseek',
    name: 'DeepSeek（深度求索）',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    presets: [
      { identifier: 'deepseek-chat', label: 'DeepSeek Chat', type: 'CHAT' },
      { identifier: 'deepseek-reasoner', label: 'DeepSeek Reasoner', type: 'CHAT' },
    ],
  },
  {
    builtinKey: 'bailian',
    name: '阿里云百炼',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    presets: [
      { identifier: 'qwen-plus', label: '通义千问 Plus', type: 'CHAT' },
      { identifier: 'qwen-max', label: '通义千问 Max', type: 'CHAT' },
      { identifier: 'qwen-turbo', label: '通义千问 Turbo', type: 'CHAT' },
      { identifier: 'text-embedding-v3', label: '通用向量 v3', type: 'EMBEDDING', dimension: 1024 },
    ],
  },
  {
    builtinKey: 'siliconflow',
    name: '硅基流动',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    presets: [
      { identifier: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', type: 'CHAT' },
      { identifier: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', type: 'CHAT' },
      { identifier: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B', type: 'CHAT' },
      { identifier: 'BAAI/bge-m3', label: 'BGE-M3 向量', type: 'EMBEDDING', dimension: 1024 },
    ],
  },
  {
    builtinKey: 'custom',
    name: '自定义 OpenAI 兼容服务',
    defaultBaseUrl: 'https://api.openai.com/v1',
    presets: [],
  },
];

/** 按内置标识取预置模型；自建服务商返回空数组。 */
export function presetsOfProvider(builtinKey: string | null): ModelPreset[] {
  if (!builtinKey) {
    return [];
  }
  const provider = DEFAULT_MODEL_PROVIDERS.find((item) => item.builtinKey === builtinKey);
  return provider ? provider.presets.map((preset) => ({ ...preset })) : [];
}
