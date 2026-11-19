import { NotFoundException } from '@nestjs/common';
import { OperationRecordsService } from './operation-records.service';

function setup() {
  const tx = { operationRuntimeRun: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, conversation: { findFirst: jest.fn().mockResolvedValue(null) }, message: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) } };
  const prisma = { ...tx, $transaction: jest.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
  return { tx, service: new OperationRecordsService(prisma as never) };
}

describe('Runtime 记录权限和状态', () => {
  it('按会话与相邻序号配对原始问答，不串用其他会话正文', async () => {
    const { tx, service } = setup();
    tx.operationRuntimeRun.findMany.mockResolvedValue([{ id: 'run', conversationId: 'c', assistantMessageId: 'm', conversation: { title: '标题' }, startedAt: new Date(), finishedAt: null }] as never);
    tx.message.findMany.mockResolvedValueOnce([{ id: 'm', conversationId: 'c', seq: 4, status: 'completed', content: '回答' }] as never)
      .mockResolvedValueOnce([{ conversationId: 'other', seq: 3, content: '其他问题' }, { conversationId: 'c', seq: 1, content: '旧问题' }, { conversationId: 'c', seq: 3, content: '本次问题' }] as never);
    const result = await service.list('owner', { page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ question: '本次问题', answer: '回答', conversationTitle: '标题', messageStatus: 'completed' });
    expect(tx.message.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { conversation: { userId: 'owner' }, role: 'user', OR: [{ conversationId: 'c', seq: 3 }] } }));
  });
  it('列表仅本人记录，详情越权返回 404', async () => {
    const { tx, service } = setup();
    await service.list('owner', { page: 1, pageSize: 20 });
    expect(tx.operationRuntimeRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner', conversation: { userId: 'owner' }, conversationId: undefined }, omit: { events: true } }));
    await expect(service.detail('owner', 'other-run')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.operationRuntimeRun.findFirst).toHaveBeenCalledWith({ where: { id: 'other-run', userId: 'owner', conversation: { userId: 'owner' } } });
  });
  it('按会话过滤必须先验证本人归属', async () => {
    const { tx, service } = setup();
    await expect(service.list('owner', { page: 1, pageSize: 20, conversationId: 'other' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.operationRuntimeRun.findMany).not.toHaveBeenCalled();
  });
  it('Runtime 成功和消息保存失败分别返回', async () => {
    const { tx, service } = setup();
    tx.operationRuntimeRun.findFirst.mockResolvedValue({ id: 'run', status: 'completed', assistantMessageId: 'msg', conversationId: 'c', startedAt: new Date(), finishedAt: new Date(), events: [] } as never);
    tx.message.findFirst.mockResolvedValue({ status: 'failed' } as never);
    expect(await service.detail('owner', 'run')).toMatchObject({ status: 'completed', messageStatus: 'failed' });
  });
  it('迟到的记录不能覆盖既有终态', async () => {
    const { tx, service } = setup();
    await service.finish('run', { status: 'completed' } as never);
    expect(tx.operationRuntimeRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run', status: 'running' } }));
  });
});
