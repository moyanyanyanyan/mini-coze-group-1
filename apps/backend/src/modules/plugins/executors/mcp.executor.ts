import { McpClient, McpClientError } from '../mcp/mcp.client';
import type { PluginToolDefinition } from '../types/plugin-tool';
import type { ToolExecutor } from './tool-executor.interface';

/**
 * 远程 MCP 工具执行器：每个工具对应一个 {@link McpClient} 连接配置，
 * 执行时通过 JSON-RPC `tools/call` 调用远端服务。
 *
 * 与内置/HTTP 执行器同属 {@link ToolExecutor} 体系，对 Runtime 透明：
 * Runtime 只拿到 PluginToolDefinition，调用入口仍是 POST /api/tools/execute。
 */
export class McpExecutor implements ToolExecutor {
  constructor(
    readonly definition: PluginToolDefinition,
    private readonly client: McpClient,
  ) {}

  async execute(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      return await this.client.callTool(this.definition.name, args);
    } catch (err) {
      if (err instanceof McpClientError) {
        throw err;
      }
      throw new McpClientError(`调用远端工具失败：${(err as Error).message}`);
    }
  }
}
