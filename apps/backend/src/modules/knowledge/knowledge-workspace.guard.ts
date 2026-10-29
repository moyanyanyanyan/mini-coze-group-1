import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { isLocalDemoRequest } from './knowledge-local-access';

@Injectable()
export class KnowledgeWorkspaceGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const workspaceId = request.query?.workspaceId ?? request.body?.workspaceId;
    if (isLocalDemoRequest(request, typeof workspaceId === 'string' ? workspaceId : undefined)) return true;
    return super.canActivate(context);
  }
}
