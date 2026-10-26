import type { PluginToolDefinition } from '../types/plugin-tool';

/**
 * 单个内置工具执行器。每个执行器自描述（definition）并自执行（execute）。
 * 业务异常请抛出 {@link ToolExecutionError}，由 executor 统一捕获并映射为 TOOL_EXEC_ERROR。
 */
export interface ToolExecutor {
  readonly definition: PluginToolDefinition;
  execute(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}
