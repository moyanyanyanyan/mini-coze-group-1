/**
 * 插件市场前端 API 封装。
 *
 * 与后端契约一致：
 * - GET  /api/plugins              → 插件目录（含 tools 定义）
 * - POST /api/tools/execute        → 直接测试执行（前端测试态使用 mock 身份字段）
 */

const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

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
}

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'INVALID_ARGUMENTS'
  | 'TOOL_EXEC_ERROR'
  | 'TIMEOUT';

export type PluginToolResult =
  | {
      toolCallId: string;
      toolName: string;
      status: 'succeeded';
      output: Record<string, unknown>;
    }
  | {
      toolCallId: string;
      toolName: string;
      status: 'failed';
      error: { code: ToolErrorCode; message: string };
    };

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

export interface ExecuteToolInput {
  toolName: string;
  arguments: Record<string, unknown>;
}

export async function executeToolDirect(
  input: ExecuteToolInput,
): Promise<PluginToolResult> {
  // 前端直接测试态：用本地 mock 身份字段；真实 Runtime 调用由后端到后端完成。
  const payload = {
    runId: `ui_test_${Date.now()}`,
    actorId: 'ui_tester',
    agentId: 'ui_tester',
    toolCallId: `call_${Date.now()}`,
    toolName: input.toolName,
    arguments: input.arguments,
  };

  const res = await fetch(`${API_BASE}/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await parseJsonOrThrow(res)) as ApiEnvelope<PluginToolResult>;
  if (!res.ok || body.code !== 200 || body.data == null) {
    throw new Error(body.message ?? `工具调用失败（HTTP ${res.status}）`);
  }
  return body.data;
}
