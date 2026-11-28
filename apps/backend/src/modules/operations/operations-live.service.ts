import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OperationsKnowledgeActivity, OperationsRetrievalRecord, OperationsIntegrationActivity } from '@minicoze/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsPageQuery } from './operations.dto';
import { sanitizeObservation } from './collection/runtime-collector.service';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function page<T>(items: T[], total: number, query: OperationsPageQuery) {
  return { items, total, page: query.page, pageSize: query.pageSize, asOf: new Date().toISOString() };
}
const paging = (query: OperationsPageQuery) => ({ take: query.pageSize, skip: (query.page - 1) * query.pageSize });

@Injectable()
export class OperationsLiveService {
  constructor(private readonly prisma: PrismaService) {}

  async knowledge(userId: string, baseId: string, query: OperationsPageQuery): Promise<OperationsKnowledgeActivity> {
    return this.prisma.$transaction(async tx => {
      if (!await tx.knowledgeBase.findFirst({ where: { id: baseId, workspaceId: userId }, select: { id: true } })) throw new NotFoundException('知识库不存在或不可访问');
      const scope: Prisma.OperationTelemetryWhereInput = { ownerId: userId, OR: [{ knowledgeBaseId: baseId }, { data: { path: ['baseIds'], array_contains: [baseId] } }] };
      const [daily, records, total] = await Promise.all([
        tx.$queryRaw<OperationsKnowledgeActivity['daily']>(Prisma.sql`
          SELECT to_char("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
            COALESCE(SUM("inputTokens"),0)::int AS "inputTokens",
            COALESCE(SUM("inputTokens") FILTER(WHERE data->>'source'='indexing'),0)::int AS "indexingTokens",
            COALESCE(SUM("inputTokens") FILTER(WHERE data->>'source'='retrieval'),0)::int AS "retrievalTokens",
            COUNT(*)::int AS requests, COUNT(*) FILTER(WHERE "inputTokens" IS NULL)::int AS "missingUsage"
          FROM "OperationTelemetry" WHERE "ownerId"=${userId} AND kind='embedding' AND status='completed'
            AND ("knowledgeBaseId"=${baseId} OR data->'baseIds' @> ${JSON.stringify([baseId])}::jsonb)
            AND "startedAt">=date_trunc('day',NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'-INTERVAL '6 days'
          GROUP BY 1 ORDER BY 1`),
        tx.operationTelemetry.findMany({ where: { ...scope, kind: 'retrieval' }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], ...paging(query) }),
        tx.operationTelemetry.count({ where: { ...scope, kind: 'retrieval' } }),
      ]);
      const runIds = records.flatMap(row => row.runId ? [row.runId] : []);
      const runs = runIds.length ? await tx.operationRuntimeRun.findMany({ where: { id: { in: runIds }, userId, conversation: { userId } }, select: { id: true, conversationId: true, events: true } }) : [];
      const retrievals: OperationsRetrievalRecord[] = records.map(row => {
        const data = object(row.data);
        const run = runs.find(item => item.id === row.runId);
        const events = Array.isArray(run?.events) ? run.events : [];
        const parsedEvents = events.map(object);
        const result = parsedEvents.find(event => event.type === 'knowledge.result') ?? parsedEvents.find(event => event.type === 'runtime.result');
        const citations = object(result?.data).citations;
        const used = Array.isArray(citations) ? new Set(citations.map(item => object(item).chunkId)) : null;
        const hits = (Array.isArray(data.hits) ? data.hits : []).map(object).filter(hit => hit.knowledgeBaseId === baseId).map(hit => ({ chunkId: String(hit.chunkId), documentId: String(hit.documentId), documentTitle: String(hit.documentTitle),
          content: String(hit.content), score: Number(hit.score), used: used ? used.has(hit.chunkId) : null }));
        return { id: row.id, runId: row.runId, conversationId: run?.conversationId ?? null, agentId: row.agentId, source: String(data.source),
          query: String(data.query ?? ''), startedAt: row.startedAt.toISOString(), durationMs: row.durationMs,
          status: row.status === 'FAILED' ? 'FAILED' : hits.length ? 'HIT' : 'NO_HIT', hits };
      });
      return { daily, retrievals: page(retrievals, total, query), asOf: new Date().toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async integrations(userId: string, query: OperationsPageQuery): Promise<OperationsIntegrationActivity> {
    return this.prisma.$transaction(async tx => {
      const apiScope = { ownerId: userId, kind: 'api' };
      const workflowScope = { userId, workflow: { creatorId: userId, workspaceId: userId } };
      const toolSource = Prisma.sql`
        SELECT t.id::text AS id,t."runId",r."conversationId",t."agentId",t."startedAt",t.data->>'toolCallId' AS "toolCallId",
          jsonb_build_object('data',jsonb_build_object('toolName',t.data->>'toolName','status',t.status,'durationMs',t."durationMs",'input',t.data->'input','output',t.data->'result'->'output','error',t.data->'result'->'error')) AS event
        FROM "OperationTelemetry" t LEFT JOIN "OperationRuntimeRun" r ON r.id::text=t."runId" AND r."userId"=${userId}::uuid
        WHERE t."ownerId"=${userId} AND t.kind='tool'
        UNION ALL
        SELECT r.id::text AS id,r.id::text AS "runId",r."conversationId",r."agentId",r."startedAt",e.value->'data'->>'toolCallId' AS "toolCallId",e.value AS event
        FROM "OperationRuntimeRun" r CROSS JOIN LATERAL jsonb_array_elements(r.events) e(value)
        WHERE r."userId"=${userId}::uuid AND EXISTS(SELECT 1 FROM "Conversation" c WHERE c.id=r."conversationId" AND c."userId"=${userId}::uuid)
          AND e.value->>'type'='tool.completed' AND NOT EXISTS(SELECT 1 FROM "OperationTelemetry" t WHERE t."ownerId"=${userId} AND t.kind='tool' AND t."runId"=r.id::text AND t.data->>'toolCallId'=e.value->'data'->>'toolCallId')`;
      const [apiTotal, failed, cancelled, average, groups, apiRows, workflows, workflowTotal, toolRows] = await Promise.all([
        tx.operationTelemetry.count({ where: apiScope }), tx.operationTelemetry.count({ where: { ...apiScope, status: 'failed' } }),
        tx.operationTelemetry.count({ where: { ...apiScope, status: 'cancelled' } }),
        tx.operationTelemetry.aggregate({ where: apiScope, _avg: { durationMs: true } }),
        tx.operationTelemetry.groupBy({ by: ['apiKeyId', 'status'], where: apiScope, _count: { _all: true }, _sum: { durationMs: true } }),
        tx.operationTelemetry.findMany({ where: apiScope, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], ...paging(query) }),
        tx.workflowRun.findMany({ where: workflowScope, include: { workflow: { select: { name: true } } }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], ...paging(query) }),
        tx.workflowRun.count({ where: workflowScope }),
        tx.$queryRaw<{ id: string; runId: string | null; conversationId: string | null; agentId: string | null; startedAt: Date; event: unknown; toolCallId: string }[]>(Prisma.sql`
          WITH calls AS (${toolSource}) SELECT * FROM calls ORDER BY "startedAt" DESC,id DESC OFFSET ${(query.page-1)*query.pageSize} LIMIT ${query.pageSize}`),
      ]);
      const toolCount = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`WITH calls AS (${toolSource}) SELECT COUNT(*)::int AS total FROM calls`);
      const keys = await tx.apiKey.findMany({ where: { id: { in: groups.flatMap(group => group.apiKeyId ? [group.apiKeyId] : []) }, agent: { ownerId: userId } }, select: { id: true, name: true } });
      const apiRunIds = apiRows.flatMap(row => row.runId ? [row.runId] : []);
      const apiRuns = apiRunIds.length ? await tx.operationRuntimeRun.findMany({ where: { id: { in: apiRunIds }, userId, conversation: { userId } }, select: { id: true, conversationId: true } }) : [];
      const byKey = [...new Set(groups.map(group => group.apiKeyId))].map(apiKeyId => {
        const selected = groups.filter(group => group.apiKeyId === apiKeyId);
        const total = selected.reduce((sum, group) => sum + group._count._all, 0);
        return { apiKeyId, name: keys.find(key => key.id === apiKeyId)?.name ?? '历史密钥', total,
          failed: selected.filter(group => group.status === 'failed').reduce((sum, group) => sum + group._count._all, 0),
          averageDurationMs: total ? selected.reduce((sum, group) => sum + (group._sum.durationMs ?? 0), 0) / total : null };
      });
      const tools = toolRows.map(row => {
        const data = object(object(row.event).data);
        return { id: `${row.id}:${row.toolCallId}`, runId: row.runId, conversationId: row.conversationId, agentId: row.agentId,
          toolName: String(data.toolName), status: String(data.status), durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
          startedAt: String(object(row.event).observedAt ?? row.startedAt.toISOString()), input: data.input ?? null, output: data.output ?? null, error: data.error ?? null };
      });
      return { api: { total: apiTotal, failed, cancelled, averageDurationMs: average._avg.durationMs, byKey },
        requests: page(apiRows.map(row => ({ id: row.id, apiKeyId: row.apiKeyId, agentId: row.agentId, conversationId: apiRuns.find(run => run.id === row.runId)?.conversationId ?? null, runId: row.runId, startedAt: row.startedAt.toISOString(), durationMs: row.durationMs, status: row.status,
          httpStatus: typeof object(row.data).httpStatus === 'number' ? Number(object(row.data).httpStatus) : null, path: String(object(row.data).path) })), apiTotal, query),
        tools: page(tools, toolCount[0]?.total ?? 0, query),
        workflows: page(workflows.map(({ workflow, ...row }) => ({ id: row.id, workflowId: row.workflowId, name: workflow.name, status: row.status, startedAt: row.startedAt.toISOString(),
          durationMs: row.endedAt ? row.endedAt.getTime() - row.startedAt.getTime() : null, input: sanitizeObservation(row.input), output: sanitizeObservation(row.output), nodeResults: sanitizeObservation(row.nodeResults), error: sanitizeObservation(row.error) })), workflowTotal, query),
        asOf: new Date().toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
