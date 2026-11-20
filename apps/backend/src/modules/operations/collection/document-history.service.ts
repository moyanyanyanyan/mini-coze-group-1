import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationsPageQuery } from '../operations.dto';

@Injectable()
export class DocumentHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, knowledgeBaseId: string, documentId: string, query: OperationsPageQuery) {
    return this.prisma.$transaction(async tx => {
      const document = await tx.knowledgeDocument.findFirst({
        where: { id: documentId, knowledgeBaseId, knowledgeBase: { workspaceId: userId } }, select: { id: true },
      });
      if (!document) throw new NotFoundException('文档不存在或不可访问');
      const where = { documentId, document: { knowledgeBaseId, knowledgeBase: { workspaceId: userId } } };
      const [rows, total] = await Promise.all([
        tx.operationDocumentAttempt.findMany({ where, orderBy: { ordinal: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        tx.operationDocumentAttempt.count({ where }),
      ]);
      return {
        items: rows.map(row => ({
          ...row, startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null, capturedAt: row.capturedAt.toISOString(),
          // PostgreSQL 将 timestamp 写入 JSON 时不带时区，统一补 UTC 后交给前端显示。
          events: Array.isArray(row.events) ? row.events.map(event => {
            if (event && typeof event === 'object' && !Array.isArray(event) && typeof event.at === 'string') {
              return { ...event, at: /(?:Z|[+-]\d{2}:\d{2})$/.test(event.at) ? event.at : `${event.at}Z` };
            }
            return event;
          }) : [],
        })),
        total, page: query.page, pageSize: query.pageSize, asOf: new Date().toISOString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
