import { useMemo, useState } from 'react';
import type { PluginToolDefinition, PluginToolResult } from './plugins.api';
import { executeToolDirect } from './plugins.api';
import { CloseIcon } from './plugin-icons';

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
    <div className="pm-modal-overlay" role="dialog" aria-modal="true" aria-label={`测试 ${tool.name}`}>
      <div className="pm-modal">
        <header className="pm-modal-header">
          <h3>
            <span className="pm-modal-title">测试</span>
            <code>{tool.name}</code>
          </h3>
          <button type="button" className="pm-icon-button" onClick={onClose} aria-label="关闭">
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <p className="pm-modal-desc">{tool.description}</p>

        <div className="pm-tool-fields">
          {propertyEntries.length === 0 ? (
            <p className="pm-tool-hint">该工具无需参数，直接执行即可。</p>
          ) : (
            propertyEntries.map(([key, schema]) => (
              <label key={key} className="pm-field">
                <span className="pm-field-label">
                  {key}
                  {requiredKeys.includes(key) ? <em className="pm-req">*</em> : null}
                  <span className="pm-field-type">{schema.type ?? 'string'}</span>
                </span>
                {schema.description ? (
                  <span className="pm-field-desc">{schema.description}</span>
                ) : null}
                <input
                  type="text"
                  value={values[key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={schema.type === 'number' ? '0' : ''}
                />
              </label>
            ))
          )}
        </div>

        {state.kind === 'success' ? (
          <pre className={`pm-result is-${state.result.status}`}>
            {JSON.stringify(state.result, null, 2)}
          </pre>
        ) : null}
        {state.kind === 'error' ? (
          <pre className="pm-result is-error">{state.message}</pre>
        ) : null}

        <footer className="pm-modal-footer">
          <button type="button" className="pm-button pm-button-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="pm-button pm-button-primary"
            onClick={handleRun}
            disabled={state.kind === 'loading'}
          >
            {state.kind === 'loading' ? '执行中…' : '执行'}
          </button>
        </footer>
      </div>
    </div>
  );
}
