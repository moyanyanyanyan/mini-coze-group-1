import { Injectable, Logger, OnModuleDestroy, OnModuleInit, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RuntimeRequestBody } from '../../../chat/runtime-client.service';
import type { OperationsRuntimeRun, OperationsRuntimeStats } from '@minicoze/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationsRunsQuery } from '../operations.dto';

export interface CollectedResult {
  status: string;
  durationMs: number;
  firstTokenMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorCode: string | null;
  events: Prisma.InputJsonValue[];
  truncated: boolean;
}

@Injectable()
export class OperationRecordsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationRecordsService.name);
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.recover();
    this.timer = setInterval(() => void this.recover(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { clearInterval(this.timer); }

  private async recover() {
    try {
      // Runtime 客户端最长 190 秒；超过五分钟仍无终态只标记采集中断，不猜测业务失败。
      await this.prisma.operationRuntimeRun.updateMany({
        where: { status: 'running', startedAt: { lt: new Date(Date.now() - 300_000) } },
        data: { status: 'interrupted', errorCode: 'COLLECTION_INTERRUPTED' },
      });
    } catch { this.logger.error('运行采集恢复失败，请检查 operations 数据表迁移及数据库连接'); }
  }

  async start(request: RuntimeRequestBody, mode: 'stream' | 'run'): Promise<boolean> {
    try {
      const conversation = await this.prisma.conversation.findFirst({ where: { id: request.conversationId, userId: request.actor.id, agentId: request.agentConfig.id }, select: { id: true } });
      if (!conversation) throw new Error('ownership');
      await this.prisma.operationRuntimeRun.create({ data: {
        id: request.runId, userId: request.actor.id, agentId: request.agentConfig.id,
        conversationId: request.conversationId, assistantMessageId: request.assistantMessageId,
        model: request.agentConfig.model, mode,
      } });
      return true;
    } catch {
      this.logger.error(`运行采集创建失败 runId=${request.runId}；聊天继续执行，本轮可能无历史记录`);
      return false;
    }
  }

  async finish(id: string, result: CollectedResult) {
    try {
      await this.prisma.operationRuntimeRun.updateMany({ where: { id, status: 'running' }, data: { ...result, finishedAt: new Date() } });
    } catch { this.logger.error(`运行采集保存失败 runId=${id}；不改变聊天响应`); }
  }

  async list(userId: string, query: OperationsRunsQuery) {
    return this.prisma.$transaction(async tx => {
      if (query.conversationId && !await tx.conversation.findFirst({ where: { id: query.conversationId, userId }, select: { id: true } })) throw new NotFoundException('会话不存在或不可访问');
      const where = { userId, conversation: { userId }, conversationId: query.conversationId };
      const [rows, total] = await Promise.all([
        tx.operationRuntimeRun.findMany({ where, omit: { events: true }, include: { conversation: { select: { title: true } } }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        tx.operationRuntimeRun.count({ where }),
      ]);
      const messages = await tx.message.findMany({ where: { id: { in: rows.map(r => r.assistantMessageId) }, conversation: { userId } }, select: { id: true, status: true, seq: true, content: true, conversationId: true } });
      // prepareRun 在同一事务中创建相邻的问答消息，不把其他轮次的问题配给本次运行。
      const questions = messages.length ? await tx.message.findMany({ where: { conversation: { userId }, role: 'user', OR: messages.map(message => ({ conversationId: message.conversationId, seq: message.seq - 1 })) }, select: { conversationId: true, seq: true, content: true } }) : [];
      const items: OperationsRuntimeRun[] = rows.map(({ conversation, ...row }) => {
        const message = messages.find(message => message.id === row.assistantMessageId);
        return {
          ...row, startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null,
          messageStatus: message?.status ?? null, answer: message?.content ?? '', conversationTitle: conversation.title,
          question: questions.find(question => question.conversationId === row.conversationId && question.seq === (message?.seq ?? 0) - 1)?.content ?? '',
        };
      });
      return { items, total, page: query.page, pageSize: query.pageSize, asOf: new Date().toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async detail(userId: string, id: string) {
    return this.prisma.$transaction(async tx => {
      const row = await tx.operationRuntimeRun.findFirst({ where: { id, userId, conversation: { userId } } });
      if (!row) throw new NotFoundException('运行记录不存在或不可访问');
      const message = await tx.message.findFirst({ where: { id: row.assistantMessageId, conversationId: row.conversationId, conversation: { userId } }, select: { status: true } });
      return { ...row, startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null, messageStatus: message?.status ?? null, asOf: new Date().toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async stats(userId: string): Promise<OperationsRuntimeStats> {
    return this.prisma.$transaction(async tx => {
      const where = { userId, conversation: { userId } };
      const [total, running, reported, aggregate] = await Promise.all([
        tx.operationRuntimeRun.count({ where }),
        tx.operationRuntimeRun.count({ where: { ...where, status: 'running' } }),
        tx.operationRuntimeRun.count({ where: { ...where, totalTokens: { not: null } } }),
        tx.operationRuntimeRun.aggregate({ where, _sum: { inputTokens: true, outputTokens: true, totalTokens: true }, _max: { totalTokens: true }, _avg: { durationMs: true } }),
      ]);
      return { total, running, reported, missingUsage: total - reported, inputTokens: aggregate._sum.inputTokens, outputTokens: aggregate._sum.outputTokens, totalTokens: aggregate._sum.totalTokens, peakTokens: aggregate._max.totalTokens, averageDurationMs: aggregate._avg.durationMs, asOf: new Date().toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
