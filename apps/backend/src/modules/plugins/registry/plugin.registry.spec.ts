import type { PrismaService } from '../../../database/prisma.service';
import {
  BUILTIN_PLUGINS,
  type BuiltinPluginRegistration,
} from '../data/plugins.data';
import type { ToolExecutor } from '../executors/tool-executor.interface';
import { PluginRegistry, validateBuiltinPlugins } from './plugin.registry';

function createPrismaMock() {
  const plugin = {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue(BUILTIN_PLUGINS.map((item) => toRow(item))),
    findUnique: jest.fn(),
  };
  plugin.findUnique.mockImplementation(async ({ where }) =>
    (await plugin.findMany()).find((row: { pluginId: string }) => row.pluginId === where.pluginId) ?? null,
  );
  const tx = { plugin, $executeRaw: jest.fn().mockResolvedValue(1) };
  return {
    plugin,
    tx,
    $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<void>) => operation(tx)),
  };
}

function toRow(registration: BuiltinPluginRegistration, enabled = true) {
  const { catalog, executors } = registration;
  return {
    pluginId: catalog.pluginId,
    title: catalog.title,
    content: catalog.content,
    icon: catalog.icon ?? null,
    tags: catalog.tags ?? [],
    configSchema: catalog.configSchema ?? {},
    tools: executors.map((executor) => executor.definition),
    kind: 'builtin',
    endpoint: null,
    enabled,
  };
}

function createExecutor(pluginId: string, name: string): ToolExecutor {
  return {
    definition: {
      pluginId,
      name,
      description: name,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    execute: jest.fn(async () => ({})),
  };
}

function createRegistration(
  pluginId: string,
  executors: ToolExecutor[],
): BuiltinPluginRegistration {
  return {
    catalog: {
      pluginId,
      title: pluginId,
      content: pluginId,
      configSchema: {},
    },
    executors,
  };
}

describe('PluginRegistry', () => {
  it('从统一注册表 Seed 数据库并注册全部内置执行器', async () => {
    const prisma = createPrismaMock();
    prisma.plugin.upsert.mockResolvedValue({});
    prisma.plugin.findMany.mockResolvedValue(
      BUILTIN_PLUGINS.map((item) => toRow(item)),
    );
    const registry = new PluginRegistry(prisma as unknown as PrismaService);

    await registry.onModuleInit();

    expect(prisma.plugin.upsert).toHaveBeenCalledTimes(BUILTIN_PLUGINS.length);
    for (const registration of BUILTIN_PLUGINS) {
      const tools = registration.executors.map(
        (executor) => executor.definition,
      );
      expect(prisma.plugin.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { pluginId: registration.catalog.pluginId },
          create: expect.objectContaining({
            pluginId: registration.catalog.pluginId,
            tools,
            kind: 'builtin',
            enabled: true,
          }),
          update: expect.objectContaining({ tools, kind: 'builtin' }),
        }),
      );
      for (const executor of registration.executors) {
        expect(await registry.getExecutor(executor.definition.name)).toBe(executor);
      }
    }
  });

  it('数据库不可用时启动失败，不恢复内存执行权限', async () => {
    const prisma = createPrismaMock();
    prisma.plugin.upsert.mockRejectedValue(new Error('database unavailable'));
    const registry = new PluginRegistry(prisma as unknown as PrismaService);
    await expect(registry.onModuleInit()).rejects.toThrow('database unavailable');
    expect(registry.listCatalog()).toEqual([]);
    expect(await registry.getExecutor('echo_text')).toBeUndefined();
    await expect(prisma.$transaction.mock.results[0].value).rejects.toThrow('database unavailable');
  });

  it('数据库中禁用的插件不进入目录且不可执行', async () => {
    const prisma = createPrismaMock();
    prisma.plugin.upsert.mockResolvedValue({});
    prisma.plugin.findMany.mockResolvedValue([
      toRow(BUILTIN_PLUGINS[0], false),
      toRow(BUILTIN_PLUGINS[1], true),
    ]);
    const registry = new PluginRegistry(prisma as unknown as PrismaService);

    await registry.onModuleInit();

    expect(registry.hasPlugin(BUILTIN_PLUGINS[0].catalog.pluginId)).toBe(false);
    expect(registry.hasPlugin(BUILTIN_PLUGINS[1].catalog.pluginId)).toBe(true);
    expect(
      await registry.getExecutor(BUILTIN_PLUGINS[0].executors[0].definition.name),
    ).toBeUndefined();
  });

  it('目录和按插件查询工具的返回结构保持不变', async () => {
    const prisma = createPrismaMock();
    prisma.plugin.upsert.mockResolvedValue({});
    prisma.plugin.findMany.mockResolvedValue(
      BUILTIN_PLUGINS.map((item) => toRow(item)),
    );
    const registry = new PluginRegistry(prisma as unknown as PrismaService);
    await registry.onModuleInit();

    const selected = BUILTIN_PLUGINS[0];
    expect(registry.listCatalog()).toEqual(
      BUILTIN_PLUGINS.map((item) => toRow(item)).map((row) => ({
        pluginId: row.pluginId,
        title: row.title,
        content: row.content,
        icon: row.icon ?? undefined,
        tags: row.tags,
        configSchema: row.configSchema,
        tools: row.tools,
      })),
    );
    expect(registry.listToolsByPluginIds([selected.catalog.pluginId])).toEqual(
      selected.executors.map((executor) => executor.definition),
    );
  });
});

describe('插件同步与运行时状态', () => {
  it('每次执行读取实时状态，停用或删除后不能复用旧目录', async () => {
    const prisma = createPrismaMock();
    const registry = new PluginRegistry(prisma as unknown as PrismaService);
    await registry.onModuleInit();
    expect(await registry.getExecutor('echo_text')).toBeDefined();
    prisma.plugin.findUnique.mockResolvedValue(toRow(BUILTIN_PLUGINS[0], false));
    expect(await registry.getExecutor('echo_text')).toBeUndefined();
    prisma.plugin.findUnique.mockResolvedValue(null);
    expect(await registry.getExecutor('echo_text')).toBeUndefined();
  });

  it('同步前发现跨类型 ID 冲突，不覆盖原数据', async () => {
    const prisma = createPrismaMock();
    prisma.plugin.findMany.mockResolvedValue([{ ...toRow(BUILTIN_PLUGINS[0]), kind: 'http' }]);
    const registry = new PluginRegistry(prisma as unknown as PrismaService);
    await expect(registry.onModuleInit()).rejects.toThrow('ID');
    expect(prisma.plugin.upsert).not.toHaveBeenCalled();
    expect(prisma.plugin.updateMany).not.toHaveBeenCalled();
  });

  it.each([true, false])('已有 HTTP 插件 enabled=%s 时工具名也不能与内置工具冲突', async (enabled) => {
    const prisma = createPrismaMock();
    const row = toRow(BUILTIN_PLUGINS[0], enabled);
    prisma.plugin.findMany.mockResolvedValue([{
      ...row, pluginId: 'custom_echo', kind: 'http',
      tools: row.tools.map((tool) => ({ ...tool, pluginId: 'custom_echo' })),
    }]);
    const registry = new PluginRegistry(prisma as unknown as PrismaService);
    await expect(registry.onModuleInit()).rejects.toThrow('工具名必须全局唯一');
    expect(prisma.plugin.upsert).not.toHaveBeenCalled();
    expect(prisma.plugin.updateMany).not.toHaveBeenCalled();
  });

  it('旧内置插件被停用并从目录移除，重复启动不覆盖已有启停状态', async () => {
    const prisma = createPrismaMock();
    const old = { ...toRow(BUILTIN_PLUGINS[0]), pluginId: 'retired_plugin', tools: [] };
    prisma.plugin.findMany.mockResolvedValue([old, ...BUILTIN_PLUGINS.map((item) => toRow(item))]);
    for (let i = 0; i < 2; i += 1) {
      const registry = new PluginRegistry(prisma as unknown as PrismaService);
      await registry.onModuleInit();
      expect(registry.hasPlugin('retired_plugin')).toBe(false);
      expect(registry.listCatalog()).toHaveLength(BUILTIN_PLUGINS.length);
    }
    expect(prisma.plugin.updateMany).toHaveBeenCalledWith({
      where: { kind: 'builtin', pluginId: { notIn: BUILTIN_PLUGINS.map(({ catalog }) => catalog.pluginId) } },
      data: { enabled: false },
    });
    for (const [args] of prisma.plugin.upsert.mock.calls) expect(args.update).not.toHaveProperty('enabled');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.plugin.findMany.mock.invocationCallOrder[0]);
  });

  it('刷新目录冲突时保留原缓存，不发布一半目录', async () => {
    const prisma = createPrismaMock();
    const registry = new PluginRegistry(prisma as unknown as PrismaService);
    await registry.onModuleInit();
    const before = registry.listCatalog();
    const row = toRow(BUILTIN_PLUGINS[0]);
    prisma.plugin.findMany.mockResolvedValue([{ ...row, tools: [...row.tools, ...row.tools] }]);
    await expect(registry.reload()).rejects.toThrow('工具名必须全局唯一');
    expect(registry.listCatalog()).toEqual(before);
  });
});

describe('validateBuiltinPlugins', () => {
  it('拒绝重复插件 ID', () => {
    const first = createRegistration('plugin_same', [
      createExecutor('plugin_same', 'tool_one'),
    ]);
    const second = createRegistration('plugin_same', [
      createExecutor('plugin_same', 'tool_two'),
    ]);

    expect(() => validateBuiltinPlugins([first, second])).toThrow(
      '内置插件 ID 必须唯一',
    );
  });

  it('拒绝没有执行器的插件', () => {
    expect(() =>
      validateBuiltinPlugins([createRegistration('plugin_empty', [])]),
    ).toThrow('至少需要一个执行器');
  });

  it('拒绝执行器所属插件不一致', () => {
    const registration = createRegistration('plugin_owner', [
      createExecutor('plugin_other', 'tool_mismatch'),
    ]);

    expect(() => validateBuiltinPlugins([registration])).toThrow('与注册插件');
  });

  it('拒绝全局重复工具名', () => {
    const first = createRegistration('plugin_one', [
      createExecutor('plugin_one', 'same_tool'),
    ]);
    const second = createRegistration('plugin_two', [
      createExecutor('plugin_two', 'same_tool'),
    ]);

    expect(() => validateBuiltinPlugins([first, second])).toThrow(
      '工具名必须全局唯一',
    );
  });
});
