import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WorkflowsRepository {
  constructor(private readonly prisma: PrismaService) {}
  create(data: Prisma.WorkflowCreateInput) { return this.prisma.workflow.create({ data }); }
  find(id: string) { return this.prisma.workflow.findUnique({ where: { id } }); }
  update(id: string, data: Prisma.WorkflowUpdateInput) { return this.prisma.workflow.update({ where: { id }, data }); }
  async list(where: Prisma.WorkflowWhereInput, page: number, size: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflow.findMany({ where, skip: (page - 1) * size, take: size, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }),
      this.prisma.workflow.count({ where }),
    ]);
    return { items, total, page, size };
  }
  startRun(data: Prisma.WorkflowRunCreateInput) { return this.prisma.workflowRun.create({ data }); }
  finishRun(id: string, data: Prisma.WorkflowRunUpdateInput) { return this.prisma.workflowRun.update({ where: { id }, data }); }
}
