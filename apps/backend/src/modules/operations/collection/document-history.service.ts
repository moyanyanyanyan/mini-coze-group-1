import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationsPageQuery } from '../operations.dto';
import type { OperationDocumentAttempt } from '@prisma/client';

export function serializeDocumentAttempt(row: OperationDocumentAttempt) {
  return { ...row, startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null, capturedAt: row.capturedAt.toISOString(),
    events: (Array.isArray(row.events) ? row.events : []).flatMap(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.at !== 'string' || typeof value.stage !== 'string') return [];
      return [{ stage: value.stage, status: typeof value.status === 'string' ? value.status : 'UNKNOWN', at: /(?:Z|[+-]\d{2}:\d{2})$/.test(value.at) ? value.at : `${value.at}Z`, ...(value.snapshot === true ? { snapshot: true } : {}) }];
    }) };
}

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
        items: rows.map(serializeDocumentAttempt),
        total, page: query.page, pageSize: query.pageSize, asOf: new Date().toISOString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
