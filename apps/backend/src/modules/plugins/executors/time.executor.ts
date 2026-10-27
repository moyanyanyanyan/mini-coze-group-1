import type { PluginToolDefinition } from '../types/plugin-tool';
import { ToolExecutionError } from './tool-executor.interface';
import type { ToolExecutor } from './tool-executor.interface';

const definition: PluginToolDefinition = {
  pluginId: 'plugin_time',
  name: 'current_time',
  description: '返回服务器当前时间，可选 IANA 时区（例如 Asia/Shanghai）。',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA 时区名，缺省使用服务器本地时区',
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export class TimeExecutor implements ToolExecutor {
  readonly definition = definition;

  async execute(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const now = new Date();
    const timezone =
      typeof args.timezone === 'string' && args.timezone.trim() !== ''
        ? args.timezone.trim()
        : undefined;

    if (timezone) {
      try {
        // 用 Intl 校验时区是否合法
        new Intl.DateTimeFormat('zh-CN', { timeZone: timezone });
      } catch {
        throw new ToolExecutionError(`未知的 IANA 时区：${timezone}`);
      }
    }

    return {
      iso: now.toISOString(),
      unixMs: now.getTime(),
      timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      local: now.toLocaleString('zh-CN', timezone ? { timeZone: timezone } : undefined),
    };
  }
}
