import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class KnowledgeRetrievalAccess {
  async assertAllowed(_actorId: string, _agentId: string, _knowledgeBaseIds: string[]): Promise<void> {
    // Replace this fail-closed adapter when the Agent binding and Auth modules are available.
    throw new ForbiddenException('Agent 绑定与工作空间权限校验尚未接入');
  }
}
