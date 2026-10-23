import { 
    createParamDecorator, 
    ExecutionContext 
} from '@nestjs/common';
import type { CurrentUser as CurrentUserPayload } from '@minicoze/shared';

// 用法：me(@CurrentUser() user: CurrentUserPayload)
// 本质：把 request.user（7.2 的 validate 返回值）取出来塞进参数
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
