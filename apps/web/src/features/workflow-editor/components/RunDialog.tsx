// src/features/workflow-editor/components/RunDialog.tsx
import React from 'react';
import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { runWorkflow } from '../services/workflow';
import type { WorkflowRunResult, StartNodeData } from '../types/workflow';

interface Props {
  workflowId: string;
  startNode: Node | null;
  onClose: () => void;
  onComplete: (result: WorkflowRunResult) => void;
}

export function RunDialog({ workflowId, startNode, onClose, onComplete }: Props) {
    const inputs = startNode
    ? ((startNode.data as unknown as StartNodeData).inputs || [])
    : [];

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    inputs.forEach((i) => {
      init[i.name] = '';
    });
    return init;
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorkflowRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    for (const inp of inputs) {
      if (inp.required && !values[inp.name]) {
        alert(`请填写「${inp.name}」`);
        return;
      }
    }
    setRunning(true);
    setError(null);
    try {
      const res = await runWorkflow(workflowId, values);
      setResult(res);
      onComplete(res);
    } catch (e: any) {
      setError(e.message || '运行失败');
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="wf-modal-mask" onClick={onClose}>
      <div
        className="wf-modal"
        style={{ width: 580, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>运行工作流</h3>

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
                      <small style={{ color: '#86909c', marginLeft: 6, fontWeight: 400 }}>
                        {inp.type}
                      </small>
                    </span>
                    <input
                      className="wf-input"
                      value={values[inp.name] || ''}
                      onChange={(e) =>
                        setValues({ ...values, [inp.name]: e.target.value })
                      }
                      placeholder={inp.description || `输入 ${inp.name}`}
                    />
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
              <span className="wf-run-id">Run ID: {result.runId}</span>
            </div>

            <div className="wf-form-field">
              <span>最终输出</span>
              <pre className="wf-run-output">
                {JSON.stringify(result.output, null, 2)}
              </pre>
            </div>

            <div className="wf-form-field">
              <span>节点执行</span>
              <div className="wf-node-results">
                {result.nodeResults.map((nr) => (
                  <div key={nr.nodeId} className="wf-node-result-item">
                    <span
                      className={`wf-node-result-dot wf-dot-${nr.status.toLowerCase()}`}
                    />
                    <span className="wf-node-result-id">{nr.nodeId}</span>
                    <span className="wf-node-result-status">{nr.status}</span>
                    {nr.durationMs != null && (
                      <span className="wf-node-result-duration">
                        {nr.durationMs}ms
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

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