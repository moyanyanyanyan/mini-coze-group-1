import React from 'react';
import type { StartInput, WorkflowRunResult } from '../types/workflow';

/** 将输出值按原有顺序展开成正文，保留文本中的换行。 */
function formatOutput(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    return Object.values(value).map(formatOutput).filter(Boolean).join('\n\n');
  }
  return String(value);
}

export interface RunDialogViewProps {
  inputs: StartInput[];
  values: Record<string, string>;
  running: boolean;
  result: WorkflowRunResult | null;
  error: string | null;
  setValue: (name: string, value: string) => void;
  handleRun: () => void;
  handleReset: () => void;
  onClose: () => void;
}

export function RunDialogView({
  inputs,
  values,
  running,
  result,
  error,
  setValue,
  handleRun,
  handleReset,
  onClose,
}: RunDialogViewProps) {
  const renderInput = (inp: StartInput) => {
    const v = values[inp.name] ?? '';

    if (inp.type === 'boolean') {
      return (
        <select
          className="wf-input"
          value={v}
          onChange={(e) => setValue(inp.name, e.target.value)}
        >
          <option value="">请选择</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    if (inp.type.startsWith('array<')) {
      return (
        <textarea
          className="wf-textarea"
          rows={3}
          value={v}
          onChange={(e) => setValue(inp.name, e.target.value)}
          placeholder='JSON 数组，如 ["a", "b", "c"]'
        />
      );
    }

    // string / number 都用 input
    return (
      <input
        className="wf-input"
        type={inp.type === 'number' ? 'number' : 'text'}
        value={v}
        onChange={(e) => setValue(inp.name, e.target.value)}
        placeholder={inp.description || `输入 ${inp.name}`}
      />
    );
  };

  const typeHint = (inp: StartInput) => {
    if (inp.type.startsWith('array<')) return 'JSON 数组，长度 ≤ 50，元素类型统一';
    if (inp.type === 'boolean') return 'true / false';
    return inp.type;
  };

  const textOutput = formatOutput(result?.output);

  return (
    <div className="wf-modal-mask" onClick={onClose}>
      <div
        className="wf-modal wf-run-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{result ? '运行结果' : '运行工作流'}</h3>

        {!result && (
          <>
            {inputs.length === 0 ? (
              <div className="wf-form-empty">该工作流没有输入参数</div>
            ) : (
              <div className="wf-form">
                {inputs.map((inp) => (
                  <label key={inp.name} className="wf-form-field">
                    <span>
                      {inp.name}
                      {inp.required && <em>*</em>}
                      <small
                        style={{
                          color: '#86909c',
                          marginLeft: 6,
                          fontWeight: 400,
                        }}
                      >
                        {typeHint(inp)}
                      </small>
                    </span>
                    {renderInput(inp)}
                  </label>
                ))}
              </div>
            )}
            {error && <div className="wf-form-error">{error}</div>}
          </>
        )}

        {result && (
          <div className="wf-run-result">
            <div className="wf-run-summary">
              <span
                className={`wf-run-status wf-run-status-${result.status.toLowerCase()}`}
              >
                {result.status === 'SUCCEEDED'
                  ? '✓ 运行成功'
                  : result.status === 'FAILED'
                  ? '✗ 运行失败'
                  : result.status}
              </span>
            </div>

            <div className="wf-form-field">
              <span>最终输出</span>
              <div className="wf-run-text">{textOutput || '（空文本）'}</div>
            </div>

            <details className="wf-run-details" open={result.status === 'FAILED'}>
              <summary>执行详情</summary>
              <div className="wf-run-id">Run ID: {result.runId}</div>
              <div className="wf-node-results">
                {result.nodeResults.map((nr, idx) => (
                  <div key={`${nr.nodeId}-${idx}`} className="wf-node-result-item">
                    <span
                      className={`wf-node-result-dot wf-dot-${nr.status.toLowerCase()}`}
                    />
                    <span className="wf-node-result-id">
                      {nr.nodeId}
                      {nr.parentId && (
                        <small style={{ color: '#86909c', marginLeft: 6 }}>
                          ({nr.parentId} 第 {nr.iteration ?? 0} 轮)
                        </small>
                      )}
                    </span>
                    <span className="wf-node-result-status">{nr.status}</span>
                    {nr.durationMs != null && (
                      <span className="wf-node-result-duration">
                        {nr.durationMs}ms
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </details>

            {result.error && (
              <div className="wf-form-error">
                {result.error.code}: {result.error.message}
              </div>
            )}
          </div>
        )}

        <div className="wf-modal-foot">
          {!result ? (
            <>
              <button className="wf-btn wf-btn-outline" onClick={onClose}>
                取消
              </button>
              <button
                className="wf-btn wf-btn-primary"
                onClick={handleRun}
                disabled={running}
              >
                {running ? '运行中...' : '开始运行'}
              </button>
            </>
          ) : (
            <>
              <button className="wf-btn wf-btn-outline" onClick={handleReset}>
                再跑一次
              </button>
              <button className="wf-btn wf-btn-primary" onClick={onClose}>
                关闭
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
