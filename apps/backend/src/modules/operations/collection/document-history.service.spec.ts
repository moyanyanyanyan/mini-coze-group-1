import { NotFoundException } from '@nestjs/common';
import { DocumentHistoryService } from './document-history.service';

describe('文档历史查询', () => {
  const setup = () => {
    const tx = { knowledgeDocument: { findFirst: jest.fn() }, operationDocumentAttempt: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    return { tx, service: new DocumentHistoryService({ $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } as never) };
  };
  it('越权或父知识库不匹配统一 404，不读取历史', async () => {
    const { tx, service } = setup();
    await expect(service.list('owner', 'kb', 'other-doc', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.knowledgeDocument.findFirst).toHaveBeenCalledWith({ where: { id: 'other-doc', knowledgeBaseId: 'kb', knowledgeBase: { workspaceId: 'owner' } }, select: { id: true } });
    expect(tx.operationDocumentAttempt.findMany).not.toHaveBeenCalled();
  });
  it('按记录序号倒序分页，未知开始时间不推断', async () => {
    const { tx, service } = setup();
    tx.knowledgeDocument.findFirst.mockResolvedValue({ id: 'doc' });
    tx.operationDocumentAttempt.findMany.mockResolvedValue([{ id: 'a', ordinal: 1, source: 'OBSERVED', startedAt: null, finishedAt: null, capturedAt: new Date('2026-11-19T00:00:00Z'), events: [{ stage: 'FAILED', at: '2026-11-19T00:00:00' }] }]);
    tx.operationDocumentAttempt.count.mockResolvedValue(4);
    const result = await service.list('owner', 'kb', 'doc', { page: 4, pageSize: 1 });
    expect(result).toMatchObject({ total: 4, page: 4, items: [{ startedAt: null, finishedAt: null, source: 'OBSERVED' }] });
    expect(result.items[0].events).toEqual([{ stage: 'FAILED', status: 'UNKNOWN', at: '2026-11-19T00:00:00Z' }]);
    expect(tx.operationDocumentAttempt.findMany).toHaveBeenCalledWith({ where: { documentId: 'doc', document: { knowledgeBaseId: 'kb', knowledgeBase: { workspaceId: 'owner' } } }, orderBy: { ordinal: 'desc' }, skip: 3, take: 1 });
  });
});
