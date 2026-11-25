import type {
  ModelConfigInput,
  ModelConfigListItem,
  ModelConfigPage,
  ModelConfigType,
  ModelProviderInput,
  ModelProviderListItem,
  ModelStatusFilter,
} from '@minicoze/ui/model-management';
import { del, get, patch, post } from '../../shared/api/http';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

function unwrap<T>(payload: ApiEnvelope<T>): T {
  return payload.data;
}

export interface ModelConfigQuery {
  keyword?: string;
  providerId?: string;
  status?: Exclude<ModelStatusFilter, 'all'>;
  type?: ModelConfigType;
  page?: number;
  pageSize?: number;
}

export async function listModelProviders(): Promise<ModelProviderListItem[]> {
  return unwrap(await get<ApiEnvelope<ModelProviderListItem[]>>('/api/model-providers'));
}

export async function createModelProvider(input: ModelProviderInput): Promise<ModelProviderListItem> {
  return unwrap(await post<ApiEnvelope<ModelProviderListItem>>('/api/model-providers', input));
}

export async function updateModelProvider(
  id: string,
  input: ModelProviderInput,
): Promise<ModelProviderListItem> {
  return unwrap(await patch<ApiEnvelope<ModelProviderListItem>>(`/api/model-providers/${id}`, input));
}

export async function deleteModelProvider(id: string): Promise<{ id: string }> {
  return unwrap(await del<ApiEnvelope<{ id: string }>>(`/api/model-providers/${id}`));
}

export async function listModelConfigs(query: ModelConfigQuery): Promise<ModelConfigPage> {
  const params = new URLSearchParams();
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.providerId) params.set('providerId', query.providerId);
  if (query.status) params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 10));
  return unwrap(await get<ApiEnvelope<ModelConfigPage>>(`/api/model-configs?${params.toString()}`));
}

export async function createModelConfig(
  input: ModelConfigInput & { apiKey: string },
): Promise<ModelConfigListItem> {
  return unwrap(await post<ApiEnvelope<ModelConfigListItem>>('/api/model-configs', input));
}

export async function updateModelConfig(
  id: string,
  input: ModelConfigInput,
): Promise<ModelConfigListItem> {
  return unwrap(await patch<ApiEnvelope<ModelConfigListItem>>(`/api/model-configs/${id}`, input));
}

export async function updateModelConfigStatus(
  id: string,
  enabled: boolean,
): Promise<ModelConfigListItem> {
  return unwrap(await patch<ApiEnvelope<ModelConfigListItem>>(`/api/model-configs/${id}/status`, { enabled }));
}

export async function deleteModelConfig(id: string): Promise<{ id: string }> {
  return unwrap(await del<ApiEnvelope<{ id: string }>>(`/api/model-configs/${id}`));
}
