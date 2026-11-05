import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  BUILTIN_PLUGINS,
  type BuiltinPluginRegistration,
} from '../data/plugins.data';
import { HttpExecutor } from '../executors/http.executor';
import type { ToolExecutor } from '../executors/tool-executor.interface';
import type {
  PluginCatalogItem,
  PluginToolDefinition,
} from '../types/plugin-tool';

interface PluginRow {
  pluginId: string;
  title: string;
  content: string;
  icon: string | null;
  tags: unknown;
  configSchema: unknown;
  tools: unknown;
  kind: string;
  endpoint: string | null;
  enabled: boolean;
}

/**
 * 插件注册表：目录数据来自 PostgreSQL，执行器按插件类型分发。
 *
 * - 内置插件启动时由统一注册表 upsert 进 DB，执行器走代码类。
 * - 历史 HTTP 插件仍按 endpoint 执行；MVP 不开放创建入口。
 * - 目录缓存由 reload 刷新；每次执行前重新检查数据库中的启用状态。
 */
@Injectable()
export class PluginRegistry implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistry.name);
  private readonly catalog = new Map<string, PluginCatalogItem>();
  private readonly builtinExecutors = new Map<string, ToolExecutor>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    validateBuiltinPlugins(BUILTIN_PLUGINS);
    for (const { executors } of BUILTIN_PLUGINS) {
      for (const executor of executors) {
        this.registerBuiltinExecutor(executor);
      }
    }

    // 同步冲突或数据库故障必须显式失败，不能回退后重新放行停用的工具。
    await this.seedBuiltinPlugins();
    await this.reload();
  }

  /** 启动时把内置插件写入 DB（已存在则按元数据更新，不覆盖 enabled）。 */
  private async seedBuiltinPlugins(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 多实例启动时串行同步目录，检查冲突和写入必须处于同一事务。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73421, 1)`;
      const rows = await tx.plugin.findMany();
      const builtinIds = BUILTIN_PLUGINS.map(({ catalog }) => catalog.pluginId);
      for (const row of rows) {
        if (builtinIds.includes(row.pluginId) && row.kind !== 'builtin') {
          throw new Error(`内置插件 ID "${row.pluginId}" 与已有 ${row.kind} 插件冲突`);
        }
      }
      const projected: PluginRow[] = [
        ...rows.filter((row) => row.kind !== 'builtin'),
        ...BUILTIN_PLUGINS.map(({ catalog, executors }) => ({
          ...catalog, icon: catalog.icon ?? null, tags: catalog.tags ?? [],
          configSchema: catalog.configSchema ?? {},
          tools: executors.map((executor) => executor.definition),
          kind: 'builtin', endpoint: null, enabled: true,
        })),
      ];
      validatePluginRows(projected);
      await tx.plugin.updateMany({
        where: { kind: 'builtin', pluginId: { notIn: builtinIds } },
        data: { enabled: false },
      });
      for (const { catalog, executors } of BUILTIN_PLUGINS) {
        const tools = executors.map((executor) => executor.definition);
        await tx.plugin.upsert({
          where: { pluginId: catalog.pluginId },
          create: {
            pluginId: catalog.pluginId,
            title: catalog.title,
            content: catalog.content,
            icon: catalog.icon ?? null,
            tags: (catalog.tags ?? []) as object,
            configSchema: (catalog.configSchema ?? {}) as object,
            tools: tools as object,
            kind: 'builtin',
            enabled: true,
          },
          update: {
            title: catalog.title,
            content: catalog.content,
            icon: catalog.icon ?? null,
            tags: (catalog.tags ?? []) as object,
            configSchema: (catalog.configSchema ?? {}) as object,
            tools: tools as object,
            kind: 'builtin',
            endpoint: null,
          },
        });
      }
    });
  }

  /** 校验完整目录后替换缓存，失败时不发布半成品目录。 */
  async reload(): Promise<void> {
    const rows = await this.prisma.plugin.findMany({
      orderBy: { id: 'asc' },
    });

    const builtinIds = new Set(BUILTIN_PLUGINS.map(({ catalog }) => catalog.pluginId));
    const availableRows = rows.filter((row) => row.kind !== 'builtin' || builtinIds.has(row.pluginId));
    validatePluginRows(availableRows);
    this.catalog.clear();
    for (const row of availableRows) {
      if (row.enabled) {
        this.catalog.set(row.pluginId, this.rowToCatalogItem(row));
      }
    }
    this.logger.log(`插件目录已加载，共 ${this.catalog.size} 个插件`);
  }

  private rowToCatalogItem(row: PluginRow): PluginCatalogItem {
    return {
      pluginId: row.pluginId,
      title: row.title,
      content: row.content,
      icon: row.icon ?? undefined,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      configSchema: (row.configSchema as Record<string, unknown>) ?? {},
      tools: Array.isArray(row.tools)
        ? (row.tools as PluginToolDefinition[])
        : [],
    };
  }

  private registerBuiltinExecutor(executor: ToolExecutor): void {
    const { name } = executor.definition;
    if (this.builtinExecutors.has(name)) {
      throw new Error(`工具名必须全局唯一，但 "${name}" 已被注册`);
    }
    this.builtinExecutors.set(name, executor);
  }

  listCatalog(): PluginCatalogItem[] {
    return Array.from(this.catalog.values()).map((item) => ({
      ...item,
      tools: item.tools.map((tool) => ({ ...tool })),
    }));
  }

  hasPlugin(pluginId: string): boolean {
    return this.catalog.has(pluginId);
  }

  listToolsByPluginIds(pluginIds: string[]): PluginToolDefinition[] {
    const result: PluginToolDefinition[] = [];
    for (const pluginId of pluginIds) {
      const item = this.catalog.get(pluginId);
      if (!item) {
        continue;
      }
      for (const tool of item.tools) {
        result.push({ ...tool });
      }
    }
    return result;
  }

  /** 仅从目录定位工具，执行前再检查实时状态，不能由内置执行器绕过停用。 */
  async getExecutor(toolName: string): Promise<ToolExecutor | undefined> {
    for (const item of this.catalog.values()) {
      if (!item.tools.some((tool) => tool.name === toolName)) continue;
      const row = await this.getRow(item.pluginId);
      if (!row?.enabled) return undefined;
      const tools = Array.isArray(row.tools) ? row.tools as PluginToolDefinition[] : [];
      const tool = tools.find((definition) => definition.name === toolName && definition.pluginId === row.pluginId);
      if (!tool) return undefined;
      if (row.kind === 'builtin') {
        const executor = this.builtinExecutors.get(toolName);
        return executor?.definition.pluginId === row.pluginId ? executor : undefined;
      }
      if (row.kind === 'http' && row.endpoint) {
        // 已注册的内置名称不能被运行中修改的 HTTP 记录接管。
        if (this.builtinExecutors.has(toolName)) return undefined;
        return new HttpExecutor(tool, row.endpoint);
      }
      return undefined;
    }
    return undefined;
  }

  /** 查询插件实时记录，执行前确认启用状态。 */
  async getRow(pluginId: string): Promise<PluginRow | null> {
    const row = await this.prisma.plugin.findUnique({ where: { pluginId } });
    return (row as unknown as PluginRow) ?? null;
  }
}

/** 在访问数据库前校验内置插件声明，避免带着不完整注册表启动。 */
export function validateBuiltinPlugins(
  registrations: BuiltinPluginRegistration[],
): void {
  const pluginIds = new Set<string>();
  const toolNames = new Set<string>();

  for (const { catalog, executors } of registrations) {
    if (pluginIds.has(catalog.pluginId)) {
      throw new Error(
        `内置插件 ID 必须唯一，但 "${catalog.pluginId}" 重复注册`,
      );
    }
    pluginIds.add(catalog.pluginId);

    if (executors.length === 0) {
      throw new Error(`内置插件 "${catalog.pluginId}" 至少需要一个执行器`);
    }

    for (const executor of executors) {
      const definition = executor.definition;
      if (definition.pluginId !== catalog.pluginId) {
        throw new Error(
          `工具 "${definition.name}" 属于 "${definition.pluginId}"，与注册插件 "${catalog.pluginId}" 不一致`,
        );
      }
      if (toolNames.has(definition.name)) {
        throw new Error(`工具名必须全局唯一，但 "${definition.name}" 重复注册`);
      }
      toolNames.add(definition.name);
    }
  }
}

/** 停用的历史 HTTP 插件也保留工具名，避免重新启用后发生冲突。 */
function validatePluginRows(rows: PluginRow[]): void {
  const names = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.tools)) throw new Error(`插件 "${row.pluginId}" 的工具定义无效`);
    for (const tool of row.tools) {
      if (!tool || typeof tool.name !== 'string' || tool.pluginId !== row.pluginId) {
        throw new Error(`插件 "${row.pluginId}" 的工具归属或名称无效`);
      }
      if (names.has(tool.name)) throw new Error(`工具名必须全局唯一，但 "${tool.name}" 重复注册`);
      names.add(tool.name);
    }
  }
}
