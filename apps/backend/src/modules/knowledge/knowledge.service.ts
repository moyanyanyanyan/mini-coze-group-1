import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  // Internal catalog lookup for Agent binding validation. The caller decides
  // whether the returned KBs may be bound by its authenticated user/Agent.
  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.prisma.knowledgeBase.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, status: true, workspaceId: true },
    });
  }

  async list(workspaceId: string) {
    const normalizedWorkspaceId = workspaceId?.trim();
    if (!normalizedWorkspaceId) {
      throw new BadRequestException('workspaceId 不能为空');
    }

    return this.prisma.knowledgeBase.findMany({
      where: { workspaceId: normalizedWorkspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: CreateKnowledgeBaseDto) {
    const workspaceId = input.workspaceId.trim();
    const name = input.name.trim();
    const description = input.description.trim();
    if (!workspaceId || !name) {
      throw new BadRequestException('workspaceId 和名称不能为空');
    }

    return this.prisma.knowledgeBase.create({
      data: { workspaceId, name, description },
    });
  }

  async updateStatus(id: string, workspaceId: string, status: 'ACTIVE' | 'DISABLED') {
    const updated = await this.prisma.knowledgeBase.updateMany({
      where: { id, workspaceId }, data: { status },
    });
    if (updated.count === 0) throw new NotFoundException('知识库不存在');
    return this.prisma.knowledgeBase.findUniqueOrThrow({ where: { id } });
  }

  async remove(id: string, workspaceId: string) {
    const deleted = await this.prisma.knowledgeBase.deleteMany({
      where: { id, workspaceId, documents: { none: { status: 'PROCESSING' } } },
    });
    if (deleted.count === 0) {
      const base = await this.prisma.knowledgeBase.findUnique({ where: { id }, select: { workspaceId: true } });
      if (!base || base.workspaceId !== workspaceId) throw new NotFoundException('知识库不存在');
      throw new ConflictException('知识库中有正在处理的文档，请等待处理完成后删除');
    }
    return { id };
  }
}
