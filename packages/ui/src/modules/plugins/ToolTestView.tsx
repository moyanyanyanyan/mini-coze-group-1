import { CloseIcon } from './plugin-icons';
import type { PluginToolView, ToolExecutionViewState } from './types';

export interface ToolTestViewProps {
  tool: PluginToolView;
  requiredKeys: string[];
  propertyEntries: [string, { type?: string; description?: string }][];
  values: Record<string, string>;
  state: ToolExecutionViewState;
  onValueChange: (key: string, value: string) => void;
  handleRun: () => void;
  onClose: () => void;
}

export function ToolTestView({
  tool, requiredKeys, propertyEntries, values, state, onValueChange, handleRun, onClose,
}: ToolTestViewProps) {
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
                  onChange={(e) => onValueChange(key, e.target.value)}
                  placeholder={schema.type === 'number' ? '0' : ''}
                />
              </label>
            ))
          )}
        </div>

        {state.kind === 'success' ? (
          <pre className={`pm-result is-${state.status}`}>
            {state.text}
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
