import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service';
import { PluginRegistry } from './registry/plugin.registry';
import { PluginsService } from './plugins.service';
import { BUILTIN_PLUGINS } from './data/plugins.data';

describe('新增插件服务入口', () => {
  let service: PluginsService;
  let registry: PluginRegistry;
  beforeEach(async () => {
    const rows = BUILTIN_PLUGINS.map(({ catalog, executors }) => ({
      ...catalog, tools: executors.map((executor) => executor.definition),
      kind: 'builtin', enabled: true,
    }));
    const plugin = {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn(async ({ where }) => rows.find((row) => row.pluginId === where.pluginId)),
    };
    const prisma = {
      plugin,
      $transaction: jest.fn(async (operation) => operation({ plugin, $executeRaw: jest.fn() })),
    } as unknown as PrismaService;
    registry = new PluginRegistry(prisma);
    await registry.onModuleInit();
    service = new PluginsService(
      registry,
      new ConfigService({ PLUGINS_SERVICE_TOKEN: 'test' }),
      prisma,
    );
  });
  const request = (toolName: string, args: Record<string, unknown>) => ({
    runId: 'run',
    actorId: 'user',
    agentId: 'agent',
    toolCallId: 'call',
    toolName,
    arguments: args,
  });
  it('目录包含四个插件及新工具', () => {
    expect(service.listCatalog().data).toHaveLength(4);
    const listed = service.listTools(
      ['plugin_calculator', 'plugin_web_reader'],
      'test',
    );
    expect(listed.data).toHaveLength(9);
  });
  it('经过鉴权、参数校验执行折扣计算', async () => {
    const body = request('calculate_percentage', {
      value: 128,
      percentage: 85,
    });
    expect((await service.executeTool(body, undefined)).code).toBe(401);
    expect((await service.executeTool(body, 'test')).data).toMatchObject({
      status: 'succeeded',
      output: { result: 108.8 },
    });
    expect(
      (
        await service.executeTool(
          request('add_numbers', { a: 'bad', b: 1 }),
          'test',
        )
      ).data,
    ).toMatchObject({ status: 'failed', error: { code: 'INVALID_ARGUMENTS' } });
  });
  it('网页私网错误通过业务失败返回', async () => {
    expect(
      (
        await service.executeTool(
          request('read_webpage', { url: 'http://127.0.0.1' }),
          'test',
        )
      ).data,
    ).toMatchObject({ status: 'failed', error: { code: 'TOOL_EXEC_ERROR' } });
  });
  it('已经取得工具定义后全局停用，旧请求也不能执行', async () => {
    expect(service.listTools(['plugin_echo'], 'test').data).toHaveLength(1);
    const row = await registry.getRow('plugin_echo');
    if (!row) throw new Error('测试插件不存在');
    jest.spyOn(registry, 'getRow').mockResolvedValue({ ...row, enabled: false });
    const execute = jest.spyOn(BUILTIN_PLUGINS[0].executors[0], 'execute');
    try {
      expect((await service.executeTool(request('echo_text', { text: 'test' }), 'test')).data)
        .toMatchObject({ status: 'failed', error: { code: 'TOOL_NOT_FOUND' } });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      execute.mockRestore();
    }
  });

  it('数据库状态不可读时返回 503，不执行工具', async () => {
    jest.spyOn(registry, 'getRow').mockRejectedValue(new Error('database unavailable'));
    const execute = jest.spyOn(BUILTIN_PLUGINS[0].executors[0], 'execute');
    try {
      expect(await service.executeTool(request('echo_text', { text: 'test' }), 'test'))
        .toMatchObject({ code: 503, data: null });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      execute.mockRestore();
    }
  });

});
