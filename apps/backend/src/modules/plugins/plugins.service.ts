import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { ToolExecutionError, type ToolExecutor } from './executors/tool-executor.interface';
import { McpClient, McpClientError } from './mcp/mcp.client';
import { PluginRegistry } from './registry/plugin.registry';
import { validateAgainstSchema } from './registry/schema.validator';
import type {
  ApiResponse,
  ConnectMcpRequest,
  ConnectMcpResult,
  CreatePluginRequest,
  PluginAuthType,
  PluginCatalogItem,
  PluginTestRequest,
  PluginTestResult,
  PluginToolDefinition,
  PluginToolRequest,
  PluginToolResult,
  ToolErrorCode,
} from './types/plugin-tool';

const MAX_PLUGIN_IDS = 20;
const TOOL_TIMEOUT_MS = 15_000;
const PLUGIN_ID_RE = /^[a-z][a-z0-9_]{2,63}$/;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
const VALID_AUTH_TYPES: PluginAuthType[] = ['none', 'bearer', 'api_key'];

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

  // ---------- 接口④：POST /api/plugins（创建 HTTP / MCP 插件） ----------
  async createPlugin(body: unknown): Promise<ApiResponse<PluginCatalogItem>> {
    const validationError = this.validateCreateRequest(body);
    if (validationError) {
      return { code: 400, message: validationError, data: null };
    }
    const req = body as CreatePluginRequest;
    const kind = req.kind === 'mcp' ? 'mcp' : 'http';
    const authType: PluginAuthType =
      req.authType && VALID_AUTH_TYPES.includes(req.authType) ? req.authType : 'none';

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

    // MCP 插件保存时做一次握手，记录连接状态与错误信息；失败也允许落库，便于后续排查。
    let connectionStatus: 'connected' | 'error' = 'connected';
    let lastError: string | null = null;
    if (kind === 'mcp') {
      const probe = await this.probeMcpConnection(req.endpoint, authType, req.authCredential);
      if (!probe.ok) {
        connectionStatus = 'error';
        lastError = probe.message;
      }
    }

    try {
      await this.prisma.plugin.create({
        data: {
          pluginId: req.pluginId,
          title: req.title,
          content: req.content ?? '',
          icon: req.icon ?? null,
          tags: (req.tags ?? []) as object,
          configSchema: {} as object,
          tools: tools as object,
          kind,
          endpoint: req.endpoint,
          authType,
          authCredential: req.authCredential ?? null,
          connectionStatus,
          lastError,
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
        kind: kind === 'mcp' ? 'mcp' : 'http',
        authType,
        endpoint: row.endpoint,
        connectionStatus,
        lastError: row.lastError,
      };
      return { code: 200, message: 'ok', data: item };
    } catch (err) {
      this.logger.error(`创建插件失败：${(err as Error).message}`);
      return { code: 500, message: '创建插件失败', data: null };
    }
  }

  // ---------- 接口⑤：POST /api/plugins/mcp/connect（探测远程 MCP 服务，不落库） ----------
  async connectMcp(body: unknown): Promise<ApiResponse<ConnectMcpResult>> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { code: 400, message: '请求体必须是 JSON 对象', data: null };
    }
    const req = body as ConnectMcpRequest;

    const urlError = this.validateEndpoint(req.endpoint);
    if (urlError) return { code: 400, message: urlError, data: null };

    const authType: PluginAuthType =
      req.authType && VALID_AUTH_TYPES.includes(req.authType) ? req.authType : 'none';
    const credentialError = this.validateCredential(authType, req.authCredential);
    if (credentialError) return { code: 400, message: credentialError, data: null };

    const probe = await this.probeMcpConnection(req.endpoint, authType, req.authCredential);
    if (!probe.ok) {
      return { code: 502, message: probe.message, data: null };
    }

    const title =
      (typeof req.title === 'string' && req.title.trim() !== '')
        ? req.title.trim()
        : probe.serverName ?? this.titleFromEndpoint(req.endpoint);

    const result: ConnectMcpResult = {
      endpoint: req.endpoint.trim(),
      title,
      serverName: probe.serverName,
      authType,
      tools: probe.tools,
    };
    return { code: 200, message: 'ok', data: result };
  }

  /** 握手 + tools/list；返回候选工具与服务名，失败时带错误信息。 */
  private async probeMcpConnection(
    endpoint: string,
    authType: PluginAuthType,
    credential?: string,
  ): Promise<
    { ok: true; serverName: string | null; tools: ConnectMcpResult['tools'] }
    | { ok: false; message: string }
  > {
    try {
      const client = new McpClient(endpoint, authType, credential);
      const { serverName, tools } = await client.connectAndListTools();
      return { ok: true, serverName, tools };
    } catch (err) {
      const message =
        err instanceof McpClientError ? err.message : `连接 MCP 服务失败：${(err as Error).message}`;
      return { ok: false, message };
    }
  }

  private validateEndpoint(endpoint: unknown): string | null {
    if (typeof endpoint !== 'string' || endpoint.trim() === '') {
      return 'endpoint 必须为非空字符串（远程 MCP/HTTP 服务地址）';
    }
    try {
      const u = new URL(endpoint.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return 'endpoint 仅支持 http/https；普通网页链接或模型接口地址不能作为插件使用';
      }
    } catch {
      return 'endpoint 不是合法 URL';
    }
    return null;
  }

  private validateCredential(authType: PluginAuthType, credential: unknown): string | null {
    if (authType === 'none') return null;
    if (typeof credential !== 'string' || credential.trim() === '') {
      return authType === 'bearer'
        ? '选择 Bearer Token 授权时必须填写 Token'
        : '选择 API Key 授权时必须填写 Key';
    }
    return null;
  }

  private titleFromEndpoint(endpoint: string): string {
    try {
      const u = new URL(endpoint);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return '远程 MCP 服务';
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
    if (req.kind !== undefined && req.kind !== 'http' && req.kind !== 'mcp') {
      return 'kind 仅支持 http 或 mcp';
    }
    const urlError = this.validateEndpoint(req.endpoint);
    if (urlError) return urlError;

    const authType: PluginAuthType =
      req.authType && VALID_AUTH_TYPES.includes(req.authType as PluginAuthType)
        ? (req.authType as PluginAuthType)
        : 'none';
    const credentialError = this.validateCredential(authType, req.authCredential);
    if (credentialError) return credentialError;

    if (!Array.isArray(req.tools) || req.tools.length === 0) {
      return 'tools 必须为非空数组';
    }
    for (const [i, tool] of req.tools.entries()) {
      if (typeof tool !== 'object' || tool === null) return `tools[${i}] 必须为对象`;
      const t = tool as Record<string, unknown>;
      if (typeof t.name !== 'string' || !TOOL_NAME_RE.test(t.name)) {
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
    serviceToken: string | undefined,
  ): ApiResponse<PluginToolDefinition[]> {
    // 0. 服务凭证校验
    const authError = this.checkServiceToken(serviceToken);
    if (authError) return authError;

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

  // ---------- 接口③：POST /api/tools/execute（Runtime 运行时调用） ----------
  async executeTool(
    body: unknown,
    serviceToken: string | undefined,
  ): Promise<ApiResponse<PluginToolResult>> {
    // 0. 服务凭证校验
    const authError = this.checkServiceToken(serviceToken);
    if (authError) return authError;

    // 1. 请求结构校验
    const badRequest = this.validateExecuteRequest(body);
    if (badRequest) {
      return { code: 400, message: badRequest, data: null };
    }
    const req = body as PluginToolRequest;

    // 2. 查找工具
    let executor: ToolExecutor | undefined;
    try {
      executor = await this.registry.getExecutor(req.toolName);
    } catch (err) {
      this.logger.error(`读取工具状态失败：${(err as Error).message}`);
      return { code: 503, message: '无法确认插件状态，暂时拒绝执行', data: null };
    }
    if (!executor) {
      return {
        code: 200,
        message: 'ok',
        data: this.failed(req.toolCallId, req.toolName, 'TOOL_NOT_FOUND', `工具 "${req.toolName}" 不存在、已停用或已移除`),
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

  // ---------- 接口⑥：POST /api/tools/test（后端预留测试调用，供运行管理模块；前端不展示） ----------
  async testTool(
    body: unknown,
    serviceToken: string | undefined,
  ): Promise<ApiResponse<PluginTestResult>> {
    const authError = this.checkServiceToken(serviceToken);
    if (authError) return authError;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { code: 400, message: '请求体必须是 JSON 对象', data: null };
    }
    const req = body as PluginTestRequest;
    if (typeof req.toolName !== 'string' || req.toolName.trim() === '') {
      return { code: 400, message: 'toolName 必须为非空字符串', data: null };
    }
    if (
      typeof req.arguments !== 'object' ||
      req.arguments === null ||
      Array.isArray(req.arguments)
    ) {
      return { code: 400, message: 'arguments 必须是 JSON 对象（空对象 {} 合法）', data: null };
    }

    let executor: ToolExecutor | undefined;
    try {
      executor = await this.registry.getExecutor(req.toolName);
    } catch (err) {
      this.logger.error(`读取工具状态失败：${(err as Error).message}`);
      return { code: 503, message: '无法确认插件状态，暂时拒绝执行', data: null };
    }
    if (!executor) {
      return {
        code: 200,
        message: 'ok',
        data: {
          toolName: req.toolName,
          status: 'failed',
          durationMs: 0,
          error: { code: 'TOOL_NOT_FOUND', message: `工具 "${req.toolName}" 未注册` },
        },
      };
    }

    const schemaError = validateAgainstSchema(req.arguments, executor.definition.parameters);
    if (schemaError) {
      return {
        code: 200,
        message: 'ok',
        data: {
          toolName: req.toolName,
          status: 'failed',
          durationMs: 0,
          error: { code: 'INVALID_ARGUMENTS', message: schemaError },
        },
      };
    }

    const started = Date.now();
    try {
      const output = await this.runWithTimeout(() => executor.execute(req.arguments), TOOL_TIMEOUT_MS);
      return {
        code: 200,
        message: 'ok',
        data: {
          toolName: req.toolName,
          status: 'succeeded',
          durationMs: Date.now() - started,
          output,
        },
      };
    } catch (err) {
      const durationMs = Date.now() - started;
      let code: ToolErrorCode = 'TOOL_EXEC_ERROR';
      let message = (err as Error).message;
      if (err instanceof TimeoutError) {
        code = 'TIMEOUT';
        message = `工具执行超过 ${TOOL_TIMEOUT_MS}ms`;
      } else if (!(err instanceof ToolExecutionError)) {
        this.logger.error(`测试调用未捕获异常：${(err as Error).stack ?? message}`);
        message = '工具执行服务暂时不可用';
      }
      return {
        code: 200,
        message: 'ok',
        data: { toolName: req.toolName, status: 'failed', durationMs, error: { code, message } },
      };
    }
  }

  // ---------- 内部工具 ----------

  /**
   * 服务间凭证校验：
   * - 未配置 PLUGINS_SERVICE_TOKEN → 503（部署环境配置缺失，不裸奔）
   * - 已配置但请求头缺失 → 401
   * - 已配置但 token 不匹配 → 401
   * - 通过 → null
   */
  private checkServiceToken(serviceToken: string | undefined): ApiResponse<never> | null {
    const expected = this.config.get<string>('PLUGINS_SERVICE_TOKEN');
    if (!expected || expected.length === 0) {
      return {
        code: 503,
        message: '服务间凭证未配置（PLUGINS_SERVICE_TOKEN 为空），拒绝服务间调用',
        data: null,
      };
    }
    if (!serviceToken) {
      return { code: 401, message: '缺少服务凭证（x-plugin-service-token）', data: null };
    }
    if (serviceToken !== expected) {
      return { code: 401, message: '服务凭证无效', data: null };
    }
    return null;
  }

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
