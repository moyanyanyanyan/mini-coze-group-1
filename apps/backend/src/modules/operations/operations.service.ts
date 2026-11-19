import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  OperationsAgent, OperationsBase, OperationsConversations, OperationsDocuments,
  OperationsMessages, OperationsOverview, OperationsPageResult,
} from '@minicoze/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsAgentsQuery, OperationsDocumentsQuery, OperationsPageQuery, OperationsSearchQuery } from './operations.dto';

const order = [{ updatedAt: 'desc' }, { id: 'desc' }] as const;
const agentSelect = { id: true, name: true, description: true, status: true, updatedAt: true } as const;
const baseSelect = { id: true, name: true, description: true, status: true, updatedAt: true } as const;
const conversationSelect = { id: true, agentId: true, title: true, createdAt: true, updatedAt: true } as const;
const documentSelect = {
  id: true, knowledgeBaseId: true, title: true, sourceType: true, originalFileName: true,
  status: true, stage: true, chunkCount: true, errorCode: true, errorMessage: true,
  createdAt: true, updatedAt: true,
} as const;

function pagination(query: OperationsPageQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
function page<T>(items: T[], total: number, query: OperationsPageQuery): OperationsPageResult<T> {
  return { items, total, page: query.page, pageSize: query.pageSize, asOf: new Date().toISOString() };
}
function dates<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  // 同页列表、总数和汇总使用同一数据库快照，避免并发更新导致口径不一致。
  private read<T>(query: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(query, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  overview(userId: string): Promise<OperationsOverview> {
    return this.read(async (tx) => {
      const documentWhere = { knowledgeBase: { workspaceId: userId } };
      const [agents, conversations, knowledgeBases, documents, processingDocuments, failedDocuments] = await Promise.all([
        tx.agent.count({ where: { ownerId: userId } }),
        tx.conversation.count({ where: { userId } }),
        tx.knowledgeBase.count({ where: { workspaceId: userId } }),
        tx.knowledgeDocument.count({ where: documentWhere }),
        tx.knowledgeDocument.count({ where: { ...documentWhere, status: 'PROCESSING' } }),
        tx.knowledgeDocument.count({ where: { ...documentWhere, status: 'FAILED' } }),
      ]);
      return { agents, conversations, knowledgeBases, documents, processingDocuments, failedDocuments, asOf: new Date().toISOString() };
    });
  }

  agents(userId: string, query: OperationsAgentsQuery): Promise<OperationsPageResult<OperationsAgent>> {
    return this.read(async (tx) => {
      const where: Prisma.AgentWhereInput = {
        ownerId: userId, status: query.status,
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.agent.findMany({ where, select: agentSelect, orderBy: [...order], ...pagination(query) }),
        tx.agent.count({ where }),
      ]);
      const counts = await tx.conversation.groupBy({ by: ['agentId'], where: { userId, agentId: { in: rows.map(r => r.id) } }, _count: { _all: true } });
      const byAgent = new Map(counts.map(row => [row.agentId, row._count._all]));
      return page(rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString(), conversationCount: byAgent.get(row.id) ?? 0 })), total, query);
    });
  }

  conversations(userId: string, agentId: string, query: OperationsSearchQuery): Promise<OperationsConversations> {
    return this.read(async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId, ownerId: userId }, select: { id: true, name: true } });
      if (!agent) throw new NotFoundException('智能体不存在或不可访问');
      const where: Prisma.ConversationWhereInput = { userId, agentId, ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}) };
      const [rows, total] = await Promise.all([
        tx.conversation.findMany({ where, select: conversationSelect, orderBy: [...order], ...pagination(query) }),
        tx.conversation.count({ where }),
      ]);
      return { ...page(rows.map(dates), total, query), agent };
    });
  }

  messages(userId: string, conversationId: string, query: OperationsPageQuery): Promise<OperationsMessages> {
    return this.read(async (tx) => {
      const conversation = await tx.conversation.findFirst({ where: { id: conversationId, userId }, select: conversationSelect });
      if (!conversation) throw new NotFoundException('会话不存在或不可访问');
      if (conversation.agentId && !await tx.agent.findFirst({ where: { id: conversation.agentId, ownerId: userId }, select: { id: true } })) {
        throw new NotFoundException('智能体不存在或不可访问');
      }
      const where = { conversationId, conversation: { userId } };
      const [rows, total] = await Promise.all([
        tx.message.findMany({ where, select: { id: true, role: true, status: true, seq: true, content: true, createdAt: true }, orderBy: [{ seq: 'desc' }, { id: 'desc' }], ...pagination(query) }),
        tx.message.count({ where }),
      ]);
      return { ...page(rows.reverse().map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), total, query), conversation: dates(conversation) };
    });
  }

  bases(userId: string, query: OperationsSearchQuery): Promise<OperationsPageResult<OperationsBase>> {
    return this.read(async (tx) => {
      const where: Prisma.KnowledgeBaseWhereInput = { workspaceId: userId, ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}) };
      const [rows, total] = await Promise.all([
        tx.knowledgeBase.findMany({ where, select: baseSelect, orderBy: [...order], ...pagination(query) }),
        tx.knowledgeBase.count({ where }),
      ]);
      const scope = { knowledgeBaseId: { in: rows.map(row => row.id) }, knowledgeBase: { workspaceId: userId } };
      const [documents, chunks] = await Promise.all([
        tx.knowledgeDocument.groupBy({ by: ['knowledgeBaseId', 'status'], where: scope, _count: { _all: true } }),
        tx.knowledgeChunk.groupBy({ by: ['knowledgeBaseId'], where: { ...scope, enabled: true, document: { status: 'READY' }, vector: { isNot: null } }, _count: { _all: true } }),
      ]);
      return page(rows.map(row => {
        const counts = documents.filter(d => d.knowledgeBaseId === row.id);
        return {
          ...row, updatedAt: row.updatedAt.toISOString(),
          documentCount: counts.reduce((n, d) => n + d._count._all, 0),
          processingDocuments: counts.find(d => d.status === 'PROCESSING')?._count._all ?? 0,
          failedDocuments: counts.find(d => d.status === 'FAILED')?._count._all ?? 0,
          availableChunkCount: chunks.find(c => c.knowledgeBaseId === row.id)?._count._all ?? 0,
        };
      }), total, query);
    });
  }

  documents(userId: string, knowledgeBaseId: string, query: OperationsDocumentsQuery): Promise<OperationsDocuments> {
    return this.read(async (tx) => {
      const base = await tx.knowledgeBase.findFirst({ where: { id: knowledgeBaseId, workspaceId: userId }, select: { id: true, name: true, status: true } });
      if (!base) throw new NotFoundException('知识库不存在或不可访问');
      const where: Prisma.KnowledgeDocumentWhereInput = {
        knowledgeBaseId, knowledgeBase: { workspaceId: userId }, status: query.status,
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.knowledgeDocument.findMany({ where, select: documentSelect, orderBy: [...order], ...pagination(query) }),
        tx.knowledgeDocument.count({ where }),
      ]);
      return {
        ...page(rows.map(({ errorCode, errorMessage, ...row }) => ({ ...dates(row), error: errorCode ? { code: errorCode, message: errorMessage } : null })), total, query), base,
      };
    });
  }
}
