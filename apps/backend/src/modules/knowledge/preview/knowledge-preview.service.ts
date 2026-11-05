import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { KnowledgeRetrievalService } from '../retrieval/knowledge-retrieval.service';

const PAGE_SIZE = 20;

@Injectable()
export class KnowledgePreviewService {
  constructor(private readonly prisma: PrismaService, private readonly retrieval: KnowledgeRetrievalService) {}

  async listChunks(knowledgeBaseId: string, documentId: string, workspaceId: string, page: number) {
    await this.assertBase(knowledgeBaseId, workspaceId);
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id: documentId, knowledgeBaseId }, select: { id: true },
    });
    if (!document) throw new NotFoundException('文档不存在');
    const where = { documentId, knowledgeBaseId };
    const [total, chunks] = await this.prisma.$transaction([
      this.prisma.knowledgeChunk.count({ where }),
      this.prisma.knowledgeChunk.findMany({
        where, orderBy: { position: 'asc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        select: { id: true, position: true, content: true, startOffset: true, endOffset: true, enabled: true },
      }),
    ]);
    return { items: chunks, total, page, pageSize: PAGE_SIZE };
  }

  async search(knowledgeBaseId: string, workspaceId: string, query: string) {
    await this.assertBase(knowledgeBaseId, workspaceId);
    if (typeof query !== 'string' || !query.trim() || query.length > 8000) {
      throw new BadRequestException('问题长度必须为 1～8000 字符');
    }
    return this.retrieval.searchAuthorized([knowledgeBaseId], query.trim(), 5);
  }

  private async assertBase(id: string, workspaceId: string) {
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id }, select: { workspaceId: true, status: true } });
    if (!base || base.workspaceId !== workspaceId || base.status !== 'ACTIVE') throw new NotFoundException('知识库不存在或不可用');
  }
}
