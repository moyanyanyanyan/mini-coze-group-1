import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { BUILTIN_PLUGIN_CATALOG } from '../data/plugins.data';
import { EchoExecutor } from '../executors/echo.executor';
import { HttpExecutor } from '../executors/http.executor';
import { TimeExecutor } from '../executors/time.executor';
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
 * - 内置插件（echo/time）启动时由代码 upsert 进 DB，执行器走代码类。
 * - 用户自定义插件（kind = http）由 POST /api/plugins 写入 DB，
 *   执行时按 endpoint 动态构造 {@link HttpExecutor}。
 * - 内存 catalog 是 DB 数据的只读缓存，创建/删除插件后调 {@link reload} 刷新。
 */
@Injectable()
export class PluginRegistry implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistry.name);
  private readonly catalog = new Map<string, PluginCatalogItem>();
  private readonly builtinExecutors = new Map<string, ToolExecutor>();
  private readonly httpExecutorCache = new Map<string, HttpExecutor>();
  private readonly rowCache = new Map<string, PluginRow>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // 1. 把内置插件目录 + 工具定义 upsert 进 DB，保证 DB 是唯一事实来源
    await this.seedBuiltinPlugins();
    // 2. 从 DB 加载所有 enabled 插件到内存
    await this.reload();
    // 3. 注册内置代码执行器
    this.registerBuiltinExecutor(new EchoExecutor());
    this.registerBuiltinExecutor(new TimeExecutor());
  }

  /** 启动时把内置插件写入 DB（已存在则按元数据更新，不覆盖 enabled）。 */
  private async seedBuiltinPlugins(): Promise<void> {
    const seeds: Array<{ meta: (typeof BUILTIN_PLUGIN_CATALOG)[number]; tools: PluginToolDefinition[] }> = [
      {
        meta: BUILTIN_PLUGIN_CATALOG[0],
        tools: [new EchoExecutor().definition],
      },
      {
        meta: BUILTIN_PLUGIN_CATALOG[1],
        tools: [new TimeExecutor().definition],
      },
    ];

    for (const { meta, tools } of seeds) {
      await this.prisma.plugin.upsert({
        where: { pluginId: meta.pluginId },
        create: {
          pluginId: meta.pluginId,
          title: meta.title,
          content: meta.content,
          icon: meta.icon ?? null,
          tags: (meta.tags ?? []) as object,
          configSchema: (meta.configSchema ?? {}) as object,
          tools: tools as object,
          kind: 'builtin',
          enabled: true,
        },
        update: {
          title: meta.title,
          content: meta.content,
          icon: meta.icon ?? null,
          tags: (meta.tags ?? []) as object,
          configSchema: (meta.configSchema ?? {}) as object,
          tools: tools as object,
          kind: 'builtin',
        },
      });
    }
  }

  /** 从 DB 重新加载所有 enabled 插件到内存 catalog（含 row 缓存，供 getExecutor 同步读取）。 */
  async reload(): Promise<void> {
    const rows = await this.prisma.plugin.findMany({
      orderBy: { id: 'asc' },
    });

    this.catalog.clear();
    this.rowCache.clear();
    this.httpExecutorCache.clear();
    for (const row of rows as unknown as PluginRow[]) {
      this.rowCache.set(row.pluginId, row);
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
      tools: Array.isArray(row.tools) ? (row.tools as PluginToolDefinition[]) : [],
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
      if (!item) continue;
      for (const tool of item.tools) {
        result.push({ ...tool });
      }
    }
    return result;
  }

  /**
   * 按工具名找执行器。
   *  - 内置代码执行器优先；
   *  - 否则在 catalog 里找归属插件，若 kind = http 则动态构造 HttpExecutor。
   */
  getExecutor(toolName: string): ToolExecutor | undefined {
    const builtin = this.builtinExecutors.get(toolName);
    if (builtin) return builtin;

    for (const item of this.catalog.values()) {
      const tool = item.tools.find((t) => t.name === toolName);
      if (!tool) continue;

      // 通过 row 缓存反查 kind/endpoint（reload 时已填充）
      const row = this.rowCache.get(item.pluginId);
      if (row?.kind === 'http' && row.endpoint) {
        let executor = this.httpExecutorCache.get(toolName);
        if (!executor) {
          executor = new HttpExecutor(tool, row.endpoint);
          this.httpExecutorCache.set(toolName, executor);
        }
        return executor;
      }
      return undefined;
    }
    return undefined;
  }

  /** 给 service 层在创建插件后查行用；热路径外调用。 */
  async getRow(pluginId: string): Promise<PluginRow | null> {
    const row = await this.prisma.plugin.findUnique({ where: { pluginId } });
    return (row as unknown as PluginRow) ?? null;
  }
}
