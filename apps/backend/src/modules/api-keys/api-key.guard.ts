import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import type { ApiKeyPrincipal } from './api-key-principal';

type ApiKeyRequest = Request & {
  apiKeyPrincipal?: ApiKeyPrincipal;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const authorization = request.headers.authorization;
    const match = typeof authorization === 'string'
      ? /^Bearer\s+(\S+)$/i.exec(authorization)
      : null;

    if (!match) {
      throw new UnauthorizedException('API Key 无效');
    }

    request.apiKeyPrincipal = await this.apiKeys.authenticate(match[1]);
    return true;
  }
}
