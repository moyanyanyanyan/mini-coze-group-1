import type { PrismaService } from '../../../database/prisma.service';
import {
  BUILTIN_PLUGINS,
  type BuiltinPluginRegistration,
} from '../data/plugins.data';
import type { ToolExecutor } from '../executors/tool-executor.interface';
import { PluginRegistry, validateBuiltinPlugins } from './plugin.registry';

function createPrismaMock() {
  return {
    plugin: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
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
        expect(registry.getExecutor(executor.definition.name)).toBe(executor);
      }
    }
  });

  it('数据库不可用时从同一注册表构建完整内存目录', async () => {
    const prisma = createPrismaMock();
    prisma.plugin.upsert.mockRejectedValue(new Error('database unavailable'));
    const registry = new PluginRegistry(prisma as unknown as PrismaService);

    await registry.onModuleInit();

    const catalog = registry.listCatalog();
    expect(catalog).toHaveLength(BUILTIN_PLUGINS.length);
    for (const registration of BUILTIN_PLUGINS) {
      const item = catalog.find(
        (candidate) => candidate.pluginId === registration.catalog.pluginId,
      );
      expect(item).toEqual({
        ...registration.catalog,
        tags: registration.catalog.tags ?? [],
        configSchema: registration.catalog.configSchema ?? {},
        tools: registration.executors.map((executor) => executor.definition),
      });
      for (const executor of registration.executors) {
        expect(registry.getExecutor(executor.definition.name)).toBe(executor);
      }
    }
  });

  it('数据库中禁用的插件不进入目录，但内置执行器仍保持注册', async () => {
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
      registry.getExecutor(BUILTIN_PLUGINS[0].executors[0].definition.name),
    ).toBe(BUILTIN_PLUGINS[0].executors[0]);
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
