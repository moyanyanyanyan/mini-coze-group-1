import type { PluginToolDefinition } from '../types/plugin-tool';
import { ToolExecutionError } from './tool-executor.interface';
import type { ToolExecutor } from './tool-executor.interface';

const HTTP_TIMEOUT_MS = 15_000;

/**
 * 自定义 HTTP 插件执行器：把 arguments 作为 JSON body POST 到 endpoint。
 *
 * 约定：
 *  - 远端返回 2xx 时，把响应体解析为 JSON（失败则包成 { raw, status }）作为 output；
 *  - 远端返回非 2xx 时抛 {@link ToolExecutionError}，由 service 映射为 TOOL_EXEC_ERROR；
 *  - 超时由 service 的 runWithTimeout 统一兜底，这里再加一层 AbortSignal 双保险。
 */
export class HttpExecutor implements ToolExecutor {
  constructor(
    readonly definition: PluginToolDefinition,
    private readonly endpoint: string,
  ) {}

  async execute(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new ToolExecutionError(`调用 ${this.endpoint} 超时`);
      }
      throw new ToolExecutionError(`调用 ${this.endpoint} 失败：${(err as Error).message}`);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new ToolExecutionError(
        `远端返回 HTTP ${res.status}：${text.slice(0, 200)}`,
      );
    }

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { raw: text, status: res.status };
    }
  }
}
