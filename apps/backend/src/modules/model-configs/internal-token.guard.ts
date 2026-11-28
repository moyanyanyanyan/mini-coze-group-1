import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * 内部维护接口凭证。未配置 INTERNAL_SERVICE_TOKEN 时：
 * 仅在非生产环境放行，避免本地无法排查；生产环境必须配置。
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = (process.env.INTERNAL_SERVICE_TOKEN ?? '').trim();
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('内部服务凭证未配置');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const actual = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('内部服务凭证无效');
    }
    return true;
  }
}
