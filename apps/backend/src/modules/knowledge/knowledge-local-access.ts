import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

export function isLocalDemoRequest(request: Request, workspaceId: string | undefined): boolean {
  const address = request.socket.remoteAddress;
  return process.env.NODE_ENV !== 'production'
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')
    && workspaceId === 'ws-local-demo';
}

export function resolveKnowledgeWorkspace(request: Request, workspaceId: string | undefined): string {
  if (isLocalDemoRequest(request, workspaceId)) return 'ws-local-demo';
  const userId = (request as Request & { user?: { id?: string } }).user?.id;
  if (!userId) throw new NotFoundException('知识库身份不可用');
  if (workspaceId !== userId) throw new ForbiddenException('知识库不属于当前用户');
  return userId;
}
