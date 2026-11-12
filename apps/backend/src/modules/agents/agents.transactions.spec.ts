import { plainToInstance } from 'class-transformer';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentsService } from './agents.service';

function setup(status = 'ACTIVE') {
  const agent = {
    id: 'agent-1', ownerId: 'user-1', workspaceId: 'workspace-1', status, name: 'Agent',
    systemPrompt: '', model: 'deepseek-chat', temperature: 0.7, maxTokens: 1024,
    createdAt: new Date(), updatedAt: new Date(), currentVersionId: 'version-1',
    pluginBindings: [{ id: 'binding-1', pluginId: 'plugin_echo', enabled: true, autoInvoke: false, sortOrder: 7, config: { legacy: 'keep' } }],
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
      upsert: jest.fn().mockImplementation(async ({ update }) => {
        Object.assign(agent.pluginBindings[0], update);
        return agent.pluginBindings[0];
      }),
    },
    knowledgeBaseAgentBinding: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    workflow: { count: jest.fn() },
    agentWorkflow: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    agentVersion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { version: 1 } }),
      create: jest.fn().mockResolvedValue({ id: 'version-2', version: 2 }),
    },
    modelConfig: {
      findUnique: jest.fn().mockResolvedValue({ provider: 'deepseek', upstreamModel: 'deepseek-chat' }),
    },
  };
  // 根客户端只暴露事务入口，任何越过事务的读写都会使测试失败。
  const prisma = { $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
  const models = {
    assertAvailable: jest.fn(async () => ({ key: 'deepseek-chat', enabled: true })),
    getByKey: jest.fn(async () => ({ provider: 'deepseek', upstreamModel: 'deepseek-chat' })),
    getDefaultKey: jest.fn(async () => 'deepseek-chat'),
  };
  const service = new AgentsService(prisma as never, {} as never, {
    findByIds: jest.fn(async (ids: string[]) => ids.map((pluginId) => ({ pluginId }))),
  } as never, models as never);
  return { service, prisma, tx, agent, models };
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
  expect(tx.agentPluginBinding.upsert.mock.invocationCallOrder[0]).toBeLessThan(tx.agentVersion.create.mock.invocationCallOrder[0]);
  expect(tx.agentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    version: 2,
    snapshot: expect.objectContaining({
      pluginIds: [],
      revision: 2,
      provider: 'deepseek',
      upstreamModel: 'deepseek-chat',
    }),
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


it('普通启停保留绑定 ID 和历史配置，只更新 enabled', async () => {
  const { service, tx } = setup();
  const result = await service.replacePluginBindings('agent-1', input, user);
  expect(tx.agentPluginBinding.deleteMany).toHaveBeenCalledWith({
    where: { agentId: 'agent-1', pluginId: { notIn: ['plugin_echo'] } },
  });
  expect(tx.agentPluginBinding.upsert).toHaveBeenCalledWith({
    where: { agentId_pluginId: { agentId: 'agent-1', pluginId: 'plugin_echo' } },
    create: { agentId: 'agent-1', pluginId: 'plugin_echo', enabled: false },
    update: { enabled: false },
  });
  expect(result[0]).toMatchObject({ id: 'binding-1', autoInvoke: false, sortOrder: 7, config: { legacy: 'keep' }, enabled: false });
});


it.each(['autoInvoke', 'sortOrder', 'config'])('服务层也拒绝未实现字段 %s', async (field) => {
  const { service, prisma } = setup();
  const bindings = [{ pluginId: 'plugin_echo', [field]: null }];
  await expect(service.replacePluginBindings('agent-1', { bindings }, user)).rejects.toThrow('MVP 不支持');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('清空绑定只删除该智能体的绑定并生成空插件快照', async () => {
  const { service, tx, agent } = setup();
  tx.agentPluginBinding.deleteMany.mockImplementationOnce(async () => {
    agent.pluginBindings = [];
    return { count: 1 };
  });
  await expect(service.replacePluginBindings('agent-1', { bindings: [] }, user)).resolves.toEqual([]);
  expect(tx.agentPluginBinding.deleteMany).toHaveBeenCalledWith({
    where: { agentId: 'agent-1', pluginId: { notIn: [] } },
  });
  expect(tx.agentPluginBinding.upsert).not.toHaveBeenCalled();
  expect(tx.agentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    snapshot: expect.objectContaining({ pluginIds: [] }),
  }) });
});

it('只允许绑定同一创建者和工作区内未归档的工作流，整批校验后才替换', async () => {
  const { service, tx } = setup('DRAFT');
  const bindings = [{ workflowId: 'wf-1' }, { workflowId: 'wf-2' }];
  tx.workflow.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  await expect(service.replaceWorkflowBindings('agent-1', { bindings }, user)).rejects.toThrow('工作流不存在或无权绑定');
  expect(tx.workflow.count).toHaveBeenCalledWith({ where: {
    id: { in: ['wf-1', 'wf-2'] }, creatorId: user.id, workspaceId: 'workspace-1', status: { not: 'ARCHIVED' },
  } });
  expect(tx.agentWorkflow.deleteMany).not.toHaveBeenCalled();
  await service.replaceWorkflowBindings('agent-1', { bindings }, user);
  expect(tx.agentWorkflow.createMany).toHaveBeenCalledTimes(1);
});

it('发布事务使用本次编辑的提示词，并保存清空的开场白', async () => {
  const { service, tx, agent } = setup('DRAFT');
  Object.assign(agent, { openingMessage: '旧开场白' });
  await service.update('agent-1', plainToInstance(UpdateAgentDto, { status: 'ACTIVE', systemPrompt: '新提示词', openingMessage: '' }), user);
  expect(agent).toMatchObject({ openingMessage: '' });
  expect(tx.agentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    snapshot: expect.objectContaining({ systemPrompt: '新提示词' }),
  }) });
});
