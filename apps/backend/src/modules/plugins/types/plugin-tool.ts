/**
 * 插件市场与工具执行的对外契约类型。
 *
 * 与《插件与 agent、runtime 协调草案》保持一致：
 * - HTTP 状态码与响应体 code 一致；
 * - 目录接口（GET /plugins、GET /tools）data 为数组，没有 status；
 * - 仅执行接口（POST /tools/execute）在 HTTP/code=200 后通过 data.status 表示工具业务成败。
 */

/** 远端服务鉴权方式：无密钥 / Bearer Token / API Key */
export type PluginAuthType = 'none' | 'bearer' | 'api_key';

/** 插件类型：内置代码 / 普通 HTTP 转发 / 远程 MCP 服务 */
export type PluginKind = 'builtin' | 'http' | 'mcp';

/** 最近一次与远端服务的连接状态 */
export type PluginConnectionStatus = 'unknown' | 'connected' | 'error';

export interface PluginCatalogItem {
  id?: number;
  pluginId: string;
  title: string;
  content: string;
  icon?: string;
  tags?: string[];
  configSchema?: Record<string, unknown>;
  tools: PluginToolDefinition[];
  kind?: PluginKind;
  authType?: PluginAuthType;
  endpoint?: string | null;
  connectionStatus?: PluginConnectionStatus;
  lastError?: string | null;
}

export interface PluginToolDefinition {
  pluginId: string;
  /** 工具名全局唯一 */
  name: string;
  description: string;
  /** JSON Schema，根对象必须含 additionalProperties: false */
  parameters: Record<string, unknown>;
}

export interface PluginToolRequest {
  runId: string;
  /** 最终用户或 API Key 所有者的用户 ID，不是 Key ID */
  actorId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'INVALID_ARGUMENTS'
  | 'TOOL_EXEC_ERROR'
  | 'TIMEOUT';

export type PluginToolResult = {
  toolCallId: string;
  toolName: string;
} & (
  | { status: 'succeeded'; output: Record<string, unknown>; error?: never }
  | {
      status: 'failed';
      error: { code: ToolErrorCode; message: string };
      output?: never;
    }
);

export type ApiErrorBody = {
  code: 400 | 401 | 403 | 404 | 409 | 500 | 502 | 503;
  message: string;
  data: null;
};

export type ApiOkBody<T> = {
  code: 200;
  message: 'ok';
  data: T;
};

export type ApiResponse<T> = ApiOkBody<T> | ApiErrorBody;

/**
 * POST /api/plugins 创建自定义插件的请求体。
 * - kind = "http"：每个工具执行时都会 POST 到 endpoint，arguments 作为 body。
 * - kind = "mcp"：endpoint 为远程 MCP 服务地址，tools 为已勾选启用的工具子集，
 *   authType / authCredential 用于访问远端 MCP 服务。
 */
export interface CreatePluginRequest {
  pluginId: string;
  title: string;
  content?: string;
  icon?: string;
  tags?: string[];
  kind?: 'http' | 'mcp';
  endpoint: string;
  authType?: PluginAuthType;
  authCredential?: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

/**
 * POST /api/plugins/mcp/connect 探测远程 MCP 服务。
 * 只做握手与 tools/list，不落库；返回候选工具供前端勾选。
 */
export interface ConnectMcpRequest {
  /** 远程 MCP 服务地址（http/https），普通网页链接或模型接口地址不可用 */
  endpoint: string;
  authType?: PluginAuthType;
  /** bearer token 或 api key；authType = none 时可为空 */
  authCredential?: string;
  /** 可选展示名；缺省由后端按地址推导 */
  title?: string;
}

/** 从远端 MCP 服务探测到的单个工具（未勾选前的候选） */
export interface ProbedMcpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 探测成功响应：远端信息 + 候选工具列表 */
export interface ConnectMcpResult {
  endpoint: string;
  title: string;
  serverName: string | null;
  authType: PluginAuthType;
  tools: ProbedMcpTool[];
}

/**
 * 后端预留的测试调用结果（供组长运行管理模块使用，前端插件页不展示测试入口与结果）。
 * 返回调用结果、状态、耗时与错误信息。
 */
export interface PluginTestResult {
  toolName: string;
  status: 'succeeded' | 'failed';
  /** 毫秒耗时 */
  durationMs: number;
  output?: Record<string, unknown>;
  error?: { code: ToolErrorCode; message: string };
}

/** POST /api/tools/test 测试调用请求（后端内部/运行管理模块） */
export interface PluginTestRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}
