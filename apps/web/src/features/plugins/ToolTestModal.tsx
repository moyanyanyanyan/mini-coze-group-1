import { useMemo, useState } from 'react';
import type { PluginToolDefinition, PluginToolResult } from './plugins.api';
import { executeToolDirect } from './plugins.api';
import { ToolTestView } from '@minicoze/ui/plugins';

interface ToolTestModalProps {
  tool: PluginToolDefinition;
  onClose: () => void;
  onNotify: (message: string) => void;
}

type ExecuteState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; result: PluginToolResult }
  | { kind: 'error'; message: string };

export function ToolTestModal({ tool, onClose, onNotify }: ToolTestModalProps) {
  const requiredKeys = useMemo(() => tool.parameters.required ?? [], [tool.parameters]);
  const propertyEntries = useMemo(
    () => Object.entries(tool.parameters.properties ?? {}),
    [tool.parameters],
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [key, schema] of propertyEntries) {
      init[key] = schema.type === 'number' ? '0' : '';
    }
    return init;
  });
  const [state, setState] = useState<ExecuteState>({ kind: 'idle' });

  async function handleRun() {
    setState({ kind: 'loading' });
    const args: Record<string, unknown> = {};
    for (const [key, schema] of propertyEntries) {
      const raw = values[key] ?? '';
      if (schema.type === 'number') {
        const num = Number(raw);
        args[key] = Number.isFinite(num) ? num : raw;
      } else if (schema.type === 'boolean') {
        args[key] = raw === 'true';
      } else {
        args[key] = raw;
      }
    }

    try {
      const result = await executeToolDirect({ toolName: tool.name, arguments: args });
      setState({ kind: 'success', result });
      if (result.status === 'failed') {
        onNotify(`执行失败：${result.error.message}`);
      } else {
        onNotify('执行成功');
      }
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }

  return (
    <ToolTestView
      tool={tool}
      requiredKeys={requiredKeys}
      propertyEntries={propertyEntries}
      values={values}
      state={state.kind === 'success'
        ? { kind: 'success', status: state.result.status, text: JSON.stringify(state.result, null, 2) }
        : state}
      onValueChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
      handleRun={handleRun}
      onClose={onClose}
    />
  );
}
