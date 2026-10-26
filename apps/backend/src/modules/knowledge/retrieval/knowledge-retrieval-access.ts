import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class KnowledgeRetrievalAccess {
  private readonly logger = new Logger(KnowledgeRetrievalAccess.name);

  constructor(private readonly prisma: PrismaService) {}

  async allowedIds(actorId: string, agentId: string, knowledgeBaseIds: string[]): Promise<string[]> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { id: true } });
    if (!actor) throw new UnauthorizedException('用户身份无效');

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { ownerId: true, status: true, knowledgeBaseBindings: { select: { knowledgeBaseId: true, enabled: true } } },
    });
    if (!agent || agent.ownerId !== actorId || agent.status === 'ARCHIVED') {
      throw new ForbiddenException('Agent 不存在或不可访问');
    }

    const bindings = new Map(agent.knowledgeBaseBindings.map((binding) => [binding.knowledgeBaseId, binding]));
    if (knowledgeBaseIds.some((id) => !bindings.has(id))) {
      throw new ForbiddenException('请求包含未绑定的知识库');
    }

    const bases = await this.prisma.knowledgeBase.findMany({
      where: { id: { in: knowledgeBaseIds } },
      select: { id: true, status: true, workspaceId: true },
    });
    const available = new Set(bases.filter((base) => base.status === 'ACTIVE' && base.workspaceId === actorId).map((base) => base.id));
    const allowed = knowledgeBaseIds.filter((id) => bindings.get(id)?.enabled && available.has(id));
    for (const id of knowledgeBaseIds) {
      if (!allowed.includes(id)) this.logger.warn(`Skipping disabled or unavailable knowledge base ${id} for agent ${agentId}`);
    }
    return allowed;
  }
}
