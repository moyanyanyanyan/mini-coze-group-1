import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ApiKeyPrincipal as ApiKeyPrincipalPayload } from './api-key-principal';

type ApiKeyRequest = Request & {
  apiKeyPrincipal?: ApiKeyPrincipalPayload;
};

export const ApiKeyPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiKeyPrincipalPayload => {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    return request.apiKeyPrincipal!;
  },
);
