import { del, get, patch, post } from '../../shared/api/http';

export type ModelProvider = 'deepseek' | 'siliconflow' | 'openai_compatible';

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

export interface ModelListResult {
  items: ModelSummary[];
}

export interface CreateModelInput {
  key: string;
  displayName: string;
  description?: string;
  provider: ModelProvider;
  upstreamModel: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  enabled?: boolean;
  sortOrder?: number;
}

export type UpdateModelInput = Partial<Omit<CreateModelInput, 'key'>>;

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export function getModelErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function modelPath(key: string): string {
  return `/api/models/${encodeURIComponent(key)}`;
}

export async function listModels(includeDisabled = false): Promise<ModelListResult> {
  const query = includeDisabled ? '?includeDisabled=true' : '';
  const body = await get<ApiEnvelope<ModelListResult>>(`/api/models${query}`);
  return body.data;
}

export async function createModel(input: CreateModelInput): Promise<ModelSummary> {
  const body = await post<ApiEnvelope<ModelSummary>>('/api/models', input);
  return body.data;
}

export async function updateModel(key: string, input: UpdateModelInput): Promise<ModelSummary> {
  const body = await patch<ApiEnvelope<ModelSummary>>(modelPath(key), input);
  return body.data;
}

export async function setDefaultModel(key: string): Promise<ModelSummary> {
  const body = await post<ApiEnvelope<ModelSummary>>(`${modelPath(key)}/default`);
  return body.data;
}

export async function deleteModel(key: string): Promise<void> {
  await del<ApiEnvelope<null>>(modelPath(key));
}
