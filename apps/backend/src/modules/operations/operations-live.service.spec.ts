import { NotFoundException } from '@nestjs/common';
import { OperationsLiveService } from './operations-live.service';

it('知识库用量与检索明细先验证归属，越权不会触发任何日志读取', async () => {
  const tx = { knowledgeBase: { findFirst: jest.fn().mockResolvedValue(null) }, operationTelemetry: { findMany: jest.fn() }, $queryRaw: jest.fn() };
  const service = new OperationsLiveService({ $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) } as never);
  await expect(service.knowledge('owner', 'other-base', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
  expect(tx.operationTelemetry.findMany).not.toHaveBeenCalled();
  expect(tx.$queryRaw).not.toHaveBeenCalled();
});

it.each(['knowledge.result', 'runtime.result'])('只展示当前库候选，采用情况按 %s 的真实引用匹配', async eventType => {
  const now = new Date();
  const hit = (id: string, base: string) => ({ chunkId: id, knowledgeBaseId: base, documentId: 'doc', documentTitle: '资料', content: '真实片段', score: .8 });
  const tx = {
    knowledgeBase: { findFirst: jest.fn().mockResolvedValue({ id: 'base' }) },
    $queryRaw: jest.fn().mockResolvedValue([{ date: '2026-11-27', inputTokens: 15, indexingTokens: 10, retrievalTokens: 5, requests: 2, missingUsage: 0 }]),
    operationTelemetry: { findMany: jest.fn().mockResolvedValue([{ id: 'log', runId: 'run', agentId: 'agent', startedAt: now, durationMs: 12, status: 'HIT', data: { query: '问题', source: 'chat', hits: [hit('used', 'base'), hit('unused', 'base'), hit('other', 'different')] } }]), count: jest.fn().mockResolvedValue(1) },
    operationRuntimeRun: { findMany: jest.fn().mockResolvedValue([{ id: 'run', conversationId: 'conversation', events: [{ type: eventType, data: { citations: [{ chunkId: 'used' }] } }] }]) },
  };
  const service = new OperationsLiveService({ $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) } as never);
  const data = await service.knowledge('owner', 'base', { page: 1, pageSize: 20 });
  expect(data.retrievals.items[0].hits.map(hit => [hit.chunkId, hit.used])).toEqual([['used', true], ['unused', false]]);
  expect(data.daily[0].inputTokens).toBe(15);
  expect(tx.operationTelemetry.findMany.mock.calls[0][0].where.ownerId).toBe('owner');
  expect(tx.operationRuntimeRun.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'owner', conversation: { userId: 'owner' } });
});
