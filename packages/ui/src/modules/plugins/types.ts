export interface PluginToolView {
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

export type ToolExecutionViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; status: 'succeeded' | 'failed'; text: string }
  | { kind: 'error'; message: string };
