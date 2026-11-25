/**
 * 插件市场前端 API 封装（页面编排层）。
 *
 * 与后端契约一致：
 * - GET  /api/plugins              → 插件目录（含 tools 定义、连接状态、鉴权信息）
 * - POST /api/plugins/mcp/connect  → 探测远程 MCP 服务，返回候选工具（不落库）
 * - POST /api/plugins              → 保存插件（内置之外的 HTTP / MCP 插件）
 *
 * 测试调用由后端实现并预留接口（POST /api/tools/test），供运行管理模块使用；
 * 插件前端不展示测试入口与测试结果，因此这里不再封装直连执行。
 */

const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export type PluginAuthType = 'none' | 'bearer' | 'api_key';
export type PluginKind = 'builtin' | 'http' | 'mcp';
export type PluginConnectionStatus = 'unknown' | 'connected' | 'error';

export interface PluginToolDefinition {
  pluginId: string;
  name: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

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

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new Error(`后端返回了非 JSON 响应（HTTP ${res.status}）`);
  }
}

export async function fetchPluginCatalog(): Promise<PluginCatalogItem[]> {
  const res = await fetch(`${API_BASE}/plugins`);
  const body = (await parseJsonOrThrow(res)) as ApiEnvelope<PluginCatalogItem[]>;
  if (!res.ok || body.code !== 200 || !Array.isArray(body.data)) {
    throw new Error(body.message ?? `加载插件目录失败（HTTP ${res.status}）`);
  }
  return body.data;
}

/** 探测远程 MCP 服务返回的候选工具 */
export interface ProbedMcpTool {
  name: string;
  description: string;
  parameters: PluginToolDefinition['parameters'];
}

export interface ConnectMcpInput {
  endpoint: string;
  authType: PluginAuthType;
  authCredential?: string;
  title?: string;
}

export interface ConnectMcpResult {
  endpoint: string;
  title: string;
  serverName: string | null;
  authType: PluginAuthType;
  tools: ProbedMcpTool[];
}

export async function connectMcpPlugin(input: ConnectMcpInput): Promise<ConnectMcpResult> {
  const res = await fetch(`${API_BASE}/plugins/mcp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await parseJsonOrThrow(res)) as ApiEnvelope<ConnectMcpResult>;
  if (!res.ok || body.code !== 200 || body.data == null) {
    throw new Error(body.message ?? `连接 MCP 服务失败（HTTP ${res.status}）`);
  }
  return body.data;
}

/** 保存插件请求体（当前前端仅接入远程 MCP 插件） */
export interface SavePluginInput {
  pluginId: string;
  title: string;
  content?: string;
  tags?: string[];
  kind: 'mcp';
  endpoint: string;
  authType: PluginAuthType;
  authCredential?: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: PluginToolDefinition['parameters'];
  }>;
}

export async function savePlugin(input: SavePluginInput): Promise<PluginCatalogItem> {
  const res = await fetch(`${API_BASE}/plugins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await parseJsonOrThrow(res)) as ApiEnvelope<PluginCatalogItem>;
  if (!res.ok || body.code !== 200 || body.data == null) {
    throw new Error(body.message ?? `保存插件失败（HTTP ${res.status}）`);
  }
  return body.data;
}

/** 由标题生成插件 ID slug：小写字母开头，仅小写字母/数字/下划线。 */
export function slugifyPluginId(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const withPrefix = /^[a-z]/.test(base) ? base : `plugin_${base}`;
  return withPrefix.slice(0, 63) || `plugin_${Date.now().toString(36)}`;
}
