import type { PluginAuthType, ProbedMcpTool } from '../types/plugin-tool';

const MCP_TIMEOUT_MS = 15_000;
const PROTOCOL_VERSION = '2024-11-05';

/** 远端 MCP 服务抛出的可预期业务错误，由执行器/服务层映射为 TOOL_EXEC_ERROR。 */
export class McpClientError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = 'McpClientError';
  }
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface McpToolRaw {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
}

/**
 * 远程 MCP 服务客户端（Streamable HTTP 传输，JSON-RPC 2.0）。
 *
 * 支持三种访问鉴权：
 * - none：不带凭证头；
 * - bearer：`Authorization: Bearer <credential>`；
 * - api_key：`X-API-Key: <credential>`。
 *
 * 流程：initialize 握手 → notifications/initialized → tools/list / tools/call。
 * 不引入外部 MCP SDK，仅用全局 fetch；响应兼容 JSON 与 SSE 文本流两种形态。
 */
export class McpClient {
  private nextId = 1;
  readonly endpoint: string;
  readonly authType: PluginAuthType;
  private readonly credential: string;

  constructor(endpoint: string, authType: PluginAuthType, credential?: string) {
    this.endpoint = endpoint;
    this.authType = authType;
    this.credential = (credential ?? '').trim();
  }

  private authHeaders(): Record<string, string> {
    switch (this.authType) {
      case 'bearer':
        return { Authorization: `Bearer ${this.credential}` };
      case 'api_key':
        return { 'X-API-Key': this.credential };
      case 'none':
      default:
        return {};
    }
  }

  /** 发起一次 JSON-RPC 请求；notification（无 id）不等响应。 */
  private async rpc(
    method: string,
    params?: Record<string, unknown>,
    options: { notification?: boolean } = {},
  ): Promise<unknown> {
    const body: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (!options.notification) {
      body.id = this.nextId++;
    }
    if (params !== undefined) {
      body.params = params;
    }

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...this.authHeaders(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new McpClientError(`连接 ${this.endpoint} 超时（${MCP_TIMEOUT_MS}ms）`);
      }
      throw new McpClientError(`无法连接 ${this.endpoint}：${(err as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new McpClientError(
        `远端返回 HTTP ${res.status}：${text.slice(0, 200)}`,
        res.status,
      );
    }

    if (options.notification) {
      return null;
    }

    const text = await res.text();
    const parsed = parseRpcBody(text);
    if (parsed.error) {
      throw new McpClientError(
        parsed.error.message ?? `MCP 调用失败（code ${parsed.error.code ?? '?'}）`,
      );
    }
    return parsed.result;
  }

  /** 握手并列出远端全部可用工具；不落库，供前端勾选。 */
  async connectAndListTools(): Promise<{
    serverName: string | null;
    tools: ProbedMcpTool[];
  }> {
    const initResult = (await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'minicoze-plugin-market', version: '0.1.0' },
    })) as { serverInfo?: { name?: string } } | null;

    // 握手完成通知（无响应）
    await this.rpc('notifications/initialized', undefined, { notification: true });

    const listResult = (await this.rpc('tools/list', {})) as { tools?: McpToolRaw[] } | null;
    const rawTools = Array.isArray(listResult?.tools) ? listResult.tools : [];

    const tools: ProbedMcpTool[] = rawTools.map((raw) => {
      const name = typeof raw.name === 'string' ? raw.name : '';
      const description = typeof raw.description === 'string' ? raw.description : '';
      const inputSchema = normalizeInputSchema(raw.inputSchema);
      return { name, description, parameters: inputSchema };
    }).filter((tool) => tool.name !== '');

    const serverName =
      typeof initResult?.serverInfo?.name === 'string' ? initResult.serverInfo.name : null;

    return { serverName, tools };
  }

  /** 调用远端工具，返回聚合后的结构化 output。 */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = (await this.rpc('tools/call', {
      name,
      arguments: args,
    })) as {
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    } | null;

    if (result?.isError) {
      const message = result.content?.map((c) => c.text ?? '').join('\n') || '远端工具返回错误';
      throw new McpClientError(message);
    }

    if (result?.structuredContent && typeof result.structuredContent === 'object') {
      return result.structuredContent as Record<string, unknown>;
    }

    const texts = (result?.content ?? [])
      .map((c) => (typeof c.text === 'string' ? c.text : ''))
      .filter(Boolean);
    if (texts.length === 0) {
      return { ok: true };
    }
    // 单段文本尝试解析为 JSON，避免把结构化结果包成字符串
    if (texts.length === 1) {
      try {
        const parsed = JSON.parse(texts[0]);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        return { value: parsed };
      } catch {
        return { text: texts[0] };
      }
    }
    return { text: texts.join('\n') };
  }
}

/** 解析 JSON-RPC 响应：兼容纯 JSON 与 SSE（data: 行）两种形态。 */
function parseRpcBody(text: string): JsonRpcResponse {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new McpClientError('远端返回了空响应');
  }
  try {
    return JSON.parse(trimmed) as JsonRpcResponse;
  } catch {
    // 按 SSE 提取 data: 行
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) {
      throw new McpClientError('远端响应不是合法的 JSON-RPC 消息');
    }
    const joined = dataLines.join('\n');
    try {
      return JSON.parse(joined) as JsonRpcResponse;
    } catch {
      throw new McpClientError('远端响应不是合法的 JSON-RPC 消息');
    }
  }
}

/** 把 MCP inputSchema 归一化为工具参数 JSON Schema；缺失时给空对象 Schema。 */
function normalizeInputSchema(inputSchema: unknown): Record<string, unknown> {
  if (
    typeof inputSchema === 'object' &&
    inputSchema !== null &&
    !Array.isArray(inputSchema)
  ) {
    const schema = inputSchema as Record<string, unknown>;
    return {
      type: 'object',
      properties: (schema.properties as Record<string, unknown>) ?? {},
      required: Array.isArray(schema.required) ? schema.required : [],
      additionalProperties: false,
      ...schema,
    };
  }
  return { type: 'object', properties: {}, required: [], additionalProperties: false };
}
