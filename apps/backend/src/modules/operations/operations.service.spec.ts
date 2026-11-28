import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OperationsService } from './operations.service';
import { OperationsAgentsQuery, OperationsDocumentsQuery, OperationsPageQuery } from './operations.dto';

const now = new Date('2026-11-14T00:00:00Z');
function setup() {
  const model = () => ({ findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) });
  const tx = { $queryRaw: jest.fn().mockResolvedValue([]), agent: model(), conversation: model(), message: model(), knowledgeBase: model(), knowledgeDocument: model(), knowledgeChunk: model(), agentPluginBinding: model(), plugin: model(), workflow: model(), workflowRun: model(), apiKey: model(), modelConfig: model() };
  const prisma = { knowledgeDocument: tx.knowledgeDocument, $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  return { tx, prisma, service: new OperationsService(prisma as never) };
}

describe('Operations 当前用户查询', () => {
  it('集成概览仅统计本人资源及绑定的插件，密钥只读取最后使用时间', async () => {
    const { tx, service } = setup();
    tx.agentPluginBinding.findMany.mockResolvedValue([{ pluginId: 'bound' }, { pluginId: 'bound' }]);
    tx.apiKey.findFirst.mockResolvedValue({ lastUsedAt: now });
    const result = await service.resources('owner');
    expect(tx.agentPluginBinding.findMany.mock.calls[0][0].where).toEqual({ agent: { ownerId: 'owner' } });
    expect(tx.plugin.count.mock.calls[0][0].where).toEqual({ pluginId: { in: ['bound'] } });
    expect(tx.workflow.count.mock.calls[0][0].where).toMatchObject({ creatorId: 'owner', workspaceId: 'owner' });
    expect(tx.workflowRun.count.mock.calls[0][0].where).toMatchObject({ userId: 'owner', workflow: { creatorId: 'owner' } });
    expect(tx.apiKey.findFirst.mock.calls[0][0].select).toEqual({ lastUsedAt: true });
    expect(tx.apiKey.count.mock.calls[0][0].where).toMatchObject({ createdById: 'owner', agent: { ownerId: 'owner' } });
    expect(tx.modelConfig.count.mock.calls[0][0].where).toEqual({ ownerId: 'owner' });
    expect(result.apiKeys.lastUsedAt).toBe(now.toISOString());
  });
  it('列表只返回原文件字节长度，保留零字节和未知并限制本人及父知识库', async () => {
    const { tx, service } = setup();
    tx.knowledgeBase.findFirst.mockResolvedValue({ id: 'kb', name: '资料', status: 'ACTIVE' });
    tx.knowledgeDocument.findMany.mockResolvedValue(['empty', 'missing', 'text'].map(id => ({ id, createdAt: now, updatedAt: now, errorCode: null, errorMessage: null })));
    tx.$queryRaw.mockResolvedValue([{ id: 'empty', sourceSize: 0 }, { id: 'missing', sourceSize: null }, { id: 'text', sourceSize: 6 }]);
    const result = await service.documents('owner', 'kb', { page: 1, pageSize: 20 });
    expect(result.items.map(row => row.sourceSize)).toEqual([0, null, 6]);
    const sql = tx.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(['owner', 'kb', 'empty', 'missing', 'text']);
    expect(sql.sql).toContain('octet_length');
    expect(result.items[2]).not.toHaveProperty('sourceBytes');
  });

  it('解析文本只读取本人且属于指定知识库的文档，缺失返回 404', async () => {
    const { tx, service } = setup();
    tx.knowledgeDocument.findFirst.mockResolvedValue(null);
    await expect(service.documentText('owner', 'kb', 'other')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.knowledgeDocument.findFirst).toHaveBeenCalledWith({ where: { id: 'other', knowledgeBaseId: 'kb', knowledgeBase: { workspaceId: 'owner' } }, select: { id: true, knowledgeBaseId: true, rawText: true } });
    tx.knowledgeDocument.findFirst.mockResolvedValue({ id: 'doc', knowledgeBaseId: 'kb', rawText: '' });
    await expect(service.documentText('owner', 'kb', 'doc')).resolves.toMatchObject({ rawText: '' });
  });
  it('概览全部限制当前用户，失败文档与处理中分别计数', async () => {
    const { tx, service, prisma } = setup();
    tx.agent.count.mockResolvedValue(2);
    tx.conversation.count.mockResolvedValue(3);
    tx.knowledgeBase.count.mockResolvedValue(4);
    tx.knowledgeDocument.count.mockResolvedValueOnce(9).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    await expect(service.overview('user-a')).resolves.toMatchObject({ agents: 2, conversations: 3, knowledgeBases: 4, documents: 9, processingDocuments: 2, failedDocuments: 1 });
    expect(tx.agent.count).toHaveBeenCalledWith({ where: { ownerId: 'user-a' } });
    expect(tx.conversation.count).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
    expect(tx.knowledgeBase.count).toHaveBeenCalledWith({ where: { workspaceId: 'user-a' } });
    for (const [args] of tx.knowledgeDocument.count.mock.calls) expect(args.where.knowledgeBase.workspaceId).toBe('user-a');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });

  it('Agent 会话计数只统计本人，total 不是当前页长度', async () => {
    const { tx, service } = setup();
    tx.agent.findMany.mockResolvedValue([{ id: 'a', name: 'Agent', description: null, status: 'ACTIVE', updatedAt: now }]);
    tx.agent.count.mockResolvedValue(8);
    tx.conversation.groupBy.mockResolvedValue([{ agentId: 'a', _count: { _all: 7 } }]);
    const result = await service.agents('user-a', { page: 2, pageSize: 1, q: 'Agent', status: 'ACTIVE' });
    expect(result).toMatchObject({ page: 2, pageSize: 1, total: 8, items: [{ conversationCount: 7 }] });
    expect(tx.agent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'user-a', status: 'ACTIVE', name: { contains: 'Agent', mode: 'insensitive' } }, skip: 1, take: 1 }));
    expect(tx.conversation.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a', agentId: { in: ['a'] } } }));
  });

  it('跨用户 Agent 不会继续读取其会话', async () => {
    const { tx, service } = setup();
    tx.agent.findFirst.mockResolvedValue(null);
    await expect(service.conversations('user-a', 'other-agent', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other-agent', ownerId: 'user-a' } }));
    expect(tx.conversation.findMany).not.toHaveBeenCalled();
  });

  it('跨用户会话与不存在会话均返回 404，不读取消息', async () => {
    const { tx, service } = setup();
    tx.conversation.findFirst.mockResolvedValue(null);
    await expect(service.messages('user-a', 'other-conversation', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.conversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other-conversation', userId: 'user-a' } }));
    expect(tx.message.findMany).not.toHaveBeenCalled();
  });

  it('会话父 Agent 不属于本人时拒绝消息查询', async () => {
    const { tx, service } = setup();
    tx.conversation.findFirst.mockResolvedValue({ id: 'c', agentId: 'other-agent', title: 'c', createdAt: now, updatedAt: now });
    tx.agent.findFirst.mockResolvedValue(null);
    await expect(service.messages('user-a', 'c', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.message.findMany).not.toHaveBeenCalled();
  });

  it('读取最近消息页后按原始 seq 正序展示，不伪造 Run', async () => {
    const { tx, service } = setup();
    tx.conversation.findFirst.mockResolvedValue({ id: 'c', agentId: 'a', title: '会话', createdAt: now, updatedAt: now });
    tx.agent.findFirst.mockResolvedValue({ id: 'a' });
    tx.message.findMany.mockResolvedValue([
      { id: 'm4', role: 'assistant', status: 'cancelled', seq: 4, content: '部分内容', createdAt: now },
      { id: 'm3', role: 'user', status: 'completed', seq: 3, content: '问题', createdAt: now },
    ]);
    tx.message.count.mockResolvedValue(4);
    const result = await service.messages('user-a', 'c', { page: 1, pageSize: 2 });
    expect(result.items.map(message => message.seq)).toEqual([3, 4]);
    expect(result.items[1]).toMatchObject({ status: 'cancelled', content: '部分内容' });
    expect(result.items[1]).not.toHaveProperty('runId');
    expect(tx.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { conversationId: 'c', conversation: { userId: 'user-a' } }, take: 2, orderBy: [{ seq: 'desc' }, { id: 'desc' }] }));
  });

  it('可用切片只统计 READY、启用且有向量的记录，不读取正文', async () => {
    const { tx, service } = setup();
    tx.knowledgeBase.findMany.mockResolvedValue([{ id: 'kb', name: '资料', description: '', status: 'DISABLED', createdAt: now, updatedAt: now }]);
    tx.knowledgeBase.count.mockResolvedValue(1);
    tx.knowledgeDocument.groupBy.mockResolvedValue([
      { knowledgeBaseId: 'kb', status: 'READY', _count: { _all: 2 } },
      { knowledgeBaseId: 'kb', status: 'FAILED', _count: { _all: 1 } },
    ]);
    tx.knowledgeChunk.groupBy.mockResolvedValue([{ knowledgeBaseId: 'kb', _count: { _all: 6 } }]);
    const result = await service.bases('user-a', { page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ documentCount: 3, availableChunkCount: 6, failedDocuments: 1, processingDocuments: 0, status: 'DISABLED' });
    expect(tx.knowledgeChunk.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {
      knowledgeBaseId: { in: ['kb'] }, knowledgeBase: { workspaceId: 'user-a' }, enabled: true, document: { status: 'READY' }, vector: { isNot: null },
    } }));
    expect(tx.knowledgeChunk.findMany).not.toHaveBeenCalled();
  });

  it('其他用户知识库不读取文档，合法文档列表不读取原始文件', async () => {
    const { tx, service } = setup();
    tx.knowledgeBase.findFirst.mockResolvedValue(null);
    await expect(service.documents('user-a', 'kb', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.knowledgeDocument.findMany).not.toHaveBeenCalled();
    tx.knowledgeBase.findFirst.mockResolvedValue({ id: 'kb', name: '资料', status: 'ACTIVE' });
    await service.documents('user-a', 'kb', { page: 1, pageSize: 20, status: 'FAILED' });
    const args = tx.knowledgeDocument.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ knowledgeBaseId: 'kb', knowledgeBase: { workspaceId: 'user-a' }, status: 'FAILED' });
    expect(args.select).not.toHaveProperty('sourceBytes');
    expect(args.select).not.toHaveProperty('rawText');
  });
});

describe('Operations 查询参数', () => {
  it('限制页码、分页长度、搜索长度和各自状态枚举', async () => {
    for (const input of [{ page: 0 }, { page: 1.5 }, { pageSize: 101 }, { page: 1_000_001 }]) {
      expect((await validate(plainToInstance(OperationsPageQuery, input))).length).toBeGreaterThan(0);
    }
    expect((await validate(plainToInstance(OperationsAgentsQuery, { q: 'x'.repeat(101), status: 'FAILED' }))).length).toBe(2);
    expect((await validate(plainToInstance(OperationsDocumentsQuery, { status: 'ACTIVE' }))).length).toBe(1);
    const query = plainToInstance(OperationsAgentsQuery, { q: '  智能体  ', page: '2' });
    expect(query).toMatchObject({ q: '智能体', page: 2, pageSize: 20 });
    expect(await validate(query)).toEqual([]);
  });
});
