import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

export function assertLocalKnowledgeRequest(request: Request, workspaceId: string | undefined) {
  const address = request.socket.remoteAddress;
  if (process.env.NODE_ENV === 'production' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') || workspaceId !== 'ws-local-demo') {
    throw new NotFoundException('本地知识库操作不可用');
  }
}
