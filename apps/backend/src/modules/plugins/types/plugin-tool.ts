/**
 * 插件市场与工具执行的对外契约类型。
 *
 * 与《插件与 agent、runtime 协调草案》保持一致：
 * - HTTP 状态码与响应体 code 一致；
 * - 目录接口（GET /plugins、GET /tools）data 为数组，没有 status；
 * - 仅执行接口（POST /tools/execute）在 HTTP/code=200 后通过 data.status 表示工具业务成败。
 */

export interface PluginCatalogItem {
  id?: number;
  pluginId: string;
  title: string;
  content: string;
  icon?: string;
  tags?: string[];
  configSchema?: Record<string, unknown>;
  tools: PluginToolDefinition[];
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
  code: 400 | 401 | 403 | 404 | 409 | 500 | 503;
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
 * 本周只支持 kind = "http"：每个工具执行时都会 POST 到 endpoint，arguments 作为 body。
 */
export interface CreatePluginRequest {
  pluginId: string;
  title: string;
  content?: string;
  icon?: string;
  tags?: string[];
  kind?: 'http';
  endpoint: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}
