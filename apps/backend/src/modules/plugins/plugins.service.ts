import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ToolExecutionError } from './executors/tool-executor.interface';
import { PluginRegistry } from './registry/plugin.registry';
import { validateAgainstSchema } from './registry/schema.validator';
import type {
  ApiResponse,
  CreatePluginRequest,
  PluginCatalogItem,
  PluginToolDefinition,
  PluginToolRequest,
  PluginToolResult,
  ToolErrorCode,
} from './types/plugin-tool';

const MAX_PLUGIN_IDS = 20;
const TOOL_TIMEOUT_MS = 15_000;
const PLUGIN_ID_RE = /^[a-z][a-z0-9_]{2,63}$/;

@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name);

  constructor(
    private readonly registry: PluginRegistry,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- 接口①：GET /api/plugins ----------
  listCatalog(): ApiResponse<PluginCatalogItem[]> {
    try {
      const data = this.registry.listCatalog();
      return { code: 200, message: 'ok', data };
    } catch (err) {
      this.logger.error(`读取插件目录失败：${(err as Error).message}`);
      return { code: 500, message: '插件目录暂时不可用', data: null };
    }
  }

  // ---------- 接口④：POST /api/plugins（创建自定义插件） ----------
  async createPlugin(body: unknown): Promise<ApiResponse<PluginCatalogItem>> {
    const validationError = this.validateCreateRequest(body);
    if (validationError) {
      return { code: 400, message: validationError, data: null };
    }
    const req = body as CreatePluginRequest;

    // pluginId 唯一性
    const exists = await this.prisma.plugin.findUnique({
      where: { pluginId: req.pluginId },
      select: { id: true },
    });
    if (exists) {
      return { code: 409, message: `插件 "${req.pluginId}" 已存在`, data: null };
    }

    // 工具名全局唯一（不能和内置 echo_text / current_time，以及已有自定义插件撞）
    const existingToolNames = new Set<string>();
    for (const item of this.registry.listCatalog()) {
      for (const t of item.tools) existingToolNames.add(t.name);
    }
    for (const tool of req.tools) {
      if (existingToolNames.has(tool.name)) {
        return {
          code: 409,
          message: `工具名 "${tool.name}" 已被使用，工具名必须全局唯一`,
          data: null,
        };
      }
      existingToolNames.add(tool.name);
    }

    const tools: PluginToolDefinition[] = req.tools.map((t) => ({
      pluginId: req.pluginId,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    try {
      await this.prisma.plugin.create({
        data: {
          pluginId: req.pluginId,
          title: req.title,
          content: req.content ?? '',
          icon: req.icon ?? null,
          tags: (req.tags ?? []) as Prisma.InputJsonValue,
          configSchema: {} as Prisma.InputJsonValue,
          tools: tools as unknown as Prisma.InputJsonValue,
          kind: 'http',
          endpoint: req.endpoint,
          enabled: true,
        },
      });
      // 刷新内存 catalog
      await this.registry.reload();
      const row = await this.registry.getRow(req.pluginId);
      if (!row) {
        return { code: 500, message: '插件创建后未查到记录', data: null };
      }
      const item: PluginCatalogItem = {
        pluginId: row.pluginId,
        title: row.title,
        content: row.content,
        icon: row.icon ?? undefined,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        configSchema: (row.configSchema as Record<string, unknown>) ?? {},
        tools: Array.isArray(row.tools) ? (row.tools as PluginToolDefinition[]) : [],
      };
      return { code: 200, message: 'ok', data: item };
    } catch (err) {
      this.logger.error(`创建插件失败：${(err as Error).message}`);
      return { code: 500, message: '创建插件失败', data: null };
    }
  }

  private validateCreateRequest(body: unknown): string | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return '请求体必须是 JSON 对象';
    }
    const req = body as Record<string, unknown>;

    if (typeof req.pluginId !== 'string' || !PLUGIN_ID_RE.test(req.pluginId)) {
      return 'pluginId 必须以小写字母开头，仅含小写字母/数字/下划线，长度 3-64';
    }
    if (typeof req.title !== 'string' || req.title.trim() === '') {
      return 'title 必须为非空字符串';
    }
    if (req.content !== undefined && typeof req.content !== 'string') {
      return 'content 必须为字符串';
    }
    if (req.icon !== undefined && req.icon !== null && typeof req.icon !== 'string') {
      return 'icon 必须为字符串';
    }
    if (req.tags !== undefined) {
      if (!Array.isArray(req.tags) || req.tags.some((t) => typeof t !== 'string')) {
        return 'tags 必须为 string[]';
      }
    }
    if (typeof req.endpoint !== 'string' || req.endpoint.trim() === '') {
      return 'endpoint 必须为非空字符串（HTTP 插件的请求地址）';
    }
    try {
      const u = new URL(req.endpoint);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return 'endpoint 仅支持 http/https';
      }
    } catch {
      return 'endpoint 不是合法 URL';
    }
    if (!Array.isArray(req.tools) || req.tools.length === 0) {
      return 'tools 必须为非空数组';
    }
    for (const [i, tool] of req.tools.entries()) {
      if (typeof tool !== 'object' || tool === null) return `tools[${i}] 必须为对象`;
      const t = tool as Record<string, unknown>;
      if (typeof t.name !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(t.name)) {
        return `tools[${i}].name 必须为小写下划线风格标识符`;
      }
      if (typeof t.description !== 'string' || t.description.trim() === '') {
        return `tools[${i}].description 必须为非空字符串`;
      }
      if (typeof t.parameters !== 'object' || t.parameters === null || Array.isArray(t.parameters)) {
        return `tools[${i}].parameters 必须为 JSON Schema 对象`;
      }
    }
    return null;
  }

  // ---------- 接口②：GET /api/tools?pluginIds=... ----------
  listTools(
    rawPluginIds: string | string[] | undefined,
  ): ApiResponse<PluginToolDefinition[]> {
    if (rawPluginIds === undefined || rawPluginIds === null) {
      return {
        code: 400,
        message: 'pluginIds 为必传重复查询参数（单个 ID 也使用同名参数，不接受逗号拼接）',
        data: null,
      };
    }

    const normalized = (Array.isArray(rawPluginIds) ? rawPluginIds : [rawPluginIds])
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id) => id.length > 0);

    if (normalized.length === 0) {
      return { code: 400, message: 'pluginIds 不能为空', data: null };
    }
    if (normalized.length > MAX_PLUGIN_IDS) {
      return { code: 400, message: `pluginIds 最多 ${MAX_PLUGIN_IDS} 项`, data: null };
    }

    // 去重，保留首次出现顺序
    const unique = Array.from(new Set(normalized));

    for (const pluginId of unique) {
      if (!this.registry.hasPlugin(pluginId)) {
        return {
          code: 404,
          message: `插件 "${pluginId}" 不存在或已移除`,
          data: null,
        };
      }
    }

    const data = this.registry.listToolsByPluginIds(unique);
    return { code: 200, message: 'ok', data };
  }

  // ---------- 接口③：POST /api/tools/execute ----------
  async executeTool(
    body: unknown,
    serviceToken: string | undefined,
  ): Promise<ApiResponse<PluginToolResult>> {
    // 0. 服务凭证校验
    const expectedToken = this.config.get<string>('PLUGINS_SERVICE_TOKEN');
    if (expectedToken && expectedToken.length > 0) {
      if (!serviceToken) {
        return { code: 401, message: '缺少服务凭证', data: null };
      }
      if (serviceToken !== expectedToken) {
        return { code: 401, message: '服务凭证无效', data: null };
      }
    }
    // week2：未配置 PLUGINS_SERVICE_TOKEN 时视为本地开发模式，跳过凭证校验。

    // 1. 请求结构校验
    const badRequest = this.validateExecuteRequest(body);
    if (badRequest) {
      return { code: 400, message: badRequest, data: null };
    }
    const req = body as PluginToolRequest;

    // 2. 查找工具
    const executor = this.registry.getExecutor(req.toolName);
    if (!executor) {
      return {
        code: 200,
        message: 'ok',
        data: this.failed(req.toolCallId, req.toolName, 'TOOL_NOT_FOUND', `工具 "${req.toolName}" 未注册`),
      };
    }

    // 3. Schema 校验 arguments
    const schemaError = validateAgainstSchema(req.arguments, executor.definition.parameters);
    if (schemaError) {
      return {
        code: 200,
        message: 'ok',
        data: this.failed(req.toolCallId, req.toolName, 'INVALID_ARGUMENTS', schemaError),
      };
    }

    // 4. 执行（带超时）
    try {
      const output = await this.runWithTimeout(() => executor.execute(req.arguments), TOOL_TIMEOUT_MS);
      return {
        code: 200,
        message: 'ok',
        data: {
          toolCallId: req.toolCallId,
          toolName: req.toolName,
          status: 'succeeded',
          output,
        },
      };
    } catch (err) {
      if (err instanceof ToolExecutionError) {
        return {
          code: 200,
          message: 'ok',
          data: this.failed(req.toolCallId, req.toolName, 'TOOL_EXEC_ERROR', err.message),
        };
      }
      if (err instanceof TimeoutError) {
        return {
          code: 200,
          message: 'ok',
          data: this.failed(req.toolCallId, req.toolName, 'TIMEOUT', `工具执行超过 ${TOOL_TIMEOUT_MS}ms`),
        };
      }
      // 服务自身意外故障
      this.logger.error(`工具执行未捕获异常：${(err as Error).stack ?? (err as Error).message}`);
      return { code: 500, message: '工具执行服务暂时不可用', data: null };
    }
  }

  // ---------- 内部工具 ----------

  private validateExecuteRequest(body: unknown): string | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return '请求体必须是 JSON 对象';
    }
    const req = body as Record<string, unknown>;
    const requiredFields: Array<keyof PluginToolRequest> = [
      'runId',
      'actorId',
      'agentId',
      'toolCallId',
      'toolName',
    ];
    for (const field of requiredFields) {
      if (typeof req[field] !== 'string' || (req[field] as string).trim() === '') {
        return `字段 ${field} 必须为非空字符串`;
      }
    }
    if (
      typeof req.arguments !== 'object' ||
      req.arguments === null ||
      Array.isArray(req.arguments)
    ) {
      return '字段 arguments 必须是 JSON 对象（空对象 {} 合法）';
    }
    return null;
  }

  private failed(
    toolCallId: string,
    toolName: string,
    code: ToolErrorCode,
    message: string,
  ): PluginToolResult {
    return {
      toolCallId,
      toolName,
      status: 'failed',
      error: { code, message },
    };
  }

  private runWithTimeout<T>(task: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError()), ms);
      task()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

class TimeoutError extends Error {
  constructor() {
    super('tool execution timeout');
    this.name = 'TimeoutError';
  }
}
