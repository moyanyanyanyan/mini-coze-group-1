import { AgentsService } from './agents.service';

function setup(status = 'ACTIVE') {
  const agent = {
    id: 'agent-1', ownerId: 'user-1', status, name: 'Agent',
    systemPrompt: '', model: 'deepseek-chat', temperature: 0.7, maxTokens: 1024,
    createdAt: new Date(), updatedAt: new Date(), currentVersionId: 'version-1',
    pluginBindings: [{ id: 'binding-1', pluginId: 'plugin_echo', enabled: true }],
    knowledgeBaseBindings: [], workflowBindings: [],
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: agent.id }]),
    agent: {
      findUnique: jest.fn().mockImplementation(async () => agent),
      findUniqueOrThrow: jest.fn().mockImplementation(async () => agent),
      update: jest.fn().mockImplementation(async ({ data }) => Object.assign(
        agent, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
      )),
    },
    agentPluginBinding: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockImplementation(async ({ data }) => {
        agent.pluginBindings = data;
        return { count: data.length };
      }),
    },
    knowledgeBaseAgentBinding: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    agentWorkflow: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    agentVersion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { version: 1 } }),
      create: jest.fn().mockResolvedValue({ id: 'version-2', version: 2 }),
    },
  };
  // 根客户端只暴露事务入口，任何越过事务的读写都会使测试失败。
  const prisma = { $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
  const service = new AgentsService(prisma as never, {} as never, {
    findByIds: jest.fn(async (ids: string[]) => ids.map((pluginId) => ({ pluginId }))),
  } as never);
  return { service, prisma, tx, agent };
}

const user = { id: 'user-1' };
const input = { bindings: [{ pluginId: 'plugin_echo', enabled: false }] };

it('绑定、快照和当前版本指针均在持锁的同一事务内写入', async () => {
  const { service, prisma, tx } = setup();
  const result = await service.replacePluginBindings('agent-1', input, user);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
  expect(tx.$queryRaw.mock.calls[0][1]).toBe('agent-1');
  expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.agent.findUnique.mock.invocationCallOrder[0]);
  expect(tx.agentPluginBinding.createMany.mock.invocationCallOrder[0]).toBeLessThan(tx.agentVersion.create.mock.invocationCallOrder[0]);
  expect(tx.agentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    version: 2, snapshot: expect.objectContaining({ pluginIds: [], revision: 2 }),
  }) });
  expect(tx.agent.update).toHaveBeenCalledWith({ where: { id: 'agent-1' }, data: { currentVersionId: 'version-2' } });
  expect(result).toEqual([expect.objectContaining({ pluginId: 'plugin_echo', enabled: false })]);
});

it('快照失败向事务边界传播异常，不提交当前版本或返回成功', async () => {
  const { service, prisma, tx } = setup();
  tx.agentVersion.create.mockRejectedValue(new Error('snapshot failed'));
  await expect(service.replacePluginBindings('agent-1', input, user)).rejects.toThrow('snapshot failed');
  await expect(prisma.$transaction.mock.results[0].value).rejects.toThrow('snapshot failed');
  expect(tx.agent.update).not.toHaveBeenCalled();
  expect(tx.agent.findUniqueOrThrow).not.toHaveBeenCalled();
});

it('等待智能体行锁期间不读取版本号或修改绑定', async () => {
  const { service, tx } = setup();
  let release!: () => void;
  tx.$queryRaw.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const pending = service.replacePluginBindings('agent-1', input, user);
  expect(tx.agent.findUnique).not.toHaveBeenCalled();
  expect(tx.agentPluginBinding.deleteMany).not.toHaveBeenCalled();
  expect(tx.agentVersion.aggregate).not.toHaveBeenCalled();
  release();
  await pending;
  expect(tx.agentVersion.aggregate).toHaveBeenCalledTimes(1);
});

it('草稿只保存绑定，不创建发布版本', async () => {
  const { service, tx } = setup('DRAFT');
  await service.replacePluginBindings('agent-1', input, user);
  expect(tx.agentVersion.create).not.toHaveBeenCalled();
});

it('无权限时不修改绑定', async () => {
  const { service, tx } = setup();
  await expect(service.replacePluginBindings('agent-1', input, { id: 'other' })).rejects.toThrow('无权操作');
  expect(tx.agentPluginBinding.deleteMany).not.toHaveBeenCalled();
});

it.each(['update', 'knowledge', 'workflow'] as const)('共享快照调用方 %s 同样在事务内持锁', async (operation) => {
  const { service, prisma, tx } = setup();
  if (operation === 'update') await service.update('agent-1', { name: 'Changed' }, user);
  if (operation === 'knowledge') await service.replaceKnowledgeBindings('agent-1', { bindings: [] }, user);
  if (operation === 'workflow') await service.replaceWorkflowBindings('agent-1', { bindings: [] }, user);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  expect(tx.agentVersion.create).toHaveBeenCalledTimes(1);
});
