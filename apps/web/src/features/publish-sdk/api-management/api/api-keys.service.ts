import { del, get, patch, post } from '../../../../shared/api/http';
import type { AgentOption, ApiKey, CreatedApiKey } from './api-keys.types';

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface AgentList {
  items: Array<{ id: string; name: string }>;
}

async function unwrap<T>(response: Promise<Envelope<T>>): Promise<T> {
  return (await response).data;
}

export function getAgentOptions(): Promise<AgentOption[]> {
  return unwrap(get<Envelope<AgentList>>('/api/agents'))
    .then((result) => result.items.map(({ id, name }) => ({ id, name })));
}

export function getApiKeyList(): Promise<ApiKey[]> {
  return unwrap(get<Envelope<ApiKey[]>>('/api/api-keys'));
}

export function createApiKey(agentId: string, name: string): Promise<CreatedApiKey> {
  return unwrap(post<Envelope<CreatedApiKey>>(
    `/api/agents/${encodeURIComponent(agentId)}/api-keys`,
    { name },
  ));
}

export function updateApiKeyName(id: string, name: string): Promise<ApiKey> {
  return unwrap(patch<Envelope<ApiKey>>(
    `/api/api-keys/${encodeURIComponent(id)}`,
    { name },
  ));
}

export function deleteApiKey(id: string): Promise<{ id: string }> {
  return unwrap(del<Envelope<{ id: string }>>(
    `/api/api-keys/${encodeURIComponent(id)}`,
  ));
}
