import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';
import type { ApiKeyPrincipal } from '../../api-keys/api-key-principal';

export const operationRequestContext = new AsyncLocalStorage<{
  request: Request & { apiKeyPrincipal?: ApiKeyPrincipal };
  runId?: string;
  runtimeStatus?: string;
  businessStatus?: string;
}>();
