import type { PluginToolDefinition } from '../types/plugin-tool';
import type { ToolExecutor } from './tool-executor.interface';

const definition: PluginToolDefinition = {
  pluginId: 'plugin_echo',
  name: 'echo_text',
  description: '原样回显一段文本，并返回长度与提交时间。',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要回显的文本' },
    },
    required: ['text'],
    additionalProperties: false,
  },
};

export class EchoExecutor implements ToolExecutor {
  readonly definition = definition;

  async execute(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const text = typeof args.text === 'string' ? args.text : '';
    return {
      echoed: text,
      length: text.length,
      at: new Date().toISOString(),
    };
  }
}
