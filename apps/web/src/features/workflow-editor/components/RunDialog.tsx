// src/features/workflow-editor/components/RunDialog.tsx
import React from 'react';
import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { runWorkflow } from '../services/workflow';
import type {
  WorkflowRunResult,
  StartNodeData,
  StartInput,
} from '../types/workflow';

interface Props {
  workflowId: string;
  startNode: Node | null;
  initialResult: WorkflowRunResult | null;
  onClose: () => void;
  onComplete: (result: WorkflowRunResult) => void;
}

/** 数组字段输入校验：JSON.parse 后检查类型 / 长度 / null */
function validateArrayInput(raw: string, fieldType: string): string | null {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return 'JSON 格式错误';
  }
  if (!Array.isArray(arr)) return '必须是 JSON 数组';
  if (arr.length > 50) return '最多 50 个元素';
  if (arr.some((x) => x === null)) return '元素不能为 null';

  const expect = fieldType.replace('array<', '').replace('>', '');
  const typeOk = arr.every((x) => {
    if (expect === 'string') return typeof x === 'string';
    if (expect === 'number') return typeof x === 'number';
    if (expect === 'boolean') return typeof x === 'boolean';
    return false;
  });
  if (!typeOk) return `元素必须是 ${expect} 类型`;
  return null;
}

/** 把表单里的字符串值按 type 转成后端要求的类型；返回错误消息或 payload */
function buildPayload(
  inputs: StartInput[],
  values: Record<string, string>,
): { payload?: Record<string, unknown>; error?: string } {
  const payload: Record<string, unknown> = {};
  for (const inp of inputs) {
    const raw = (values[inp.name] ?? '').trim();

    if (raw === '') {
      if (inp.required) return { error: `请填写「${inp.name}」` };
      continue;
    }

    if (inp.type === 'string') {
      payload[inp.name] = raw;
    } else if (inp.type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) return { error: `「${inp.name}」必须是数字` };
      payload[inp.name] = n;
    } else if (inp.type === 'boolean') {
      if (raw !== 'true' && raw !== 'false') {
        return { error: `「${inp.name}」必须是 true 或 false` };
      }
      payload[inp.name] = raw === 'true';
    } else if (inp.type.startsWith('array<')) {
      const err = validateArrayInput(raw, inp.type);
      if (err) return { error: `「${inp.name}」${err}` };
      payload[inp.name] = JSON.parse(raw);
    }
  }
  return { payload };
}

/** 将输出值按原有顺序展开成正文，保留文本中的换行。 */
function formatOutput(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    return Object.values(value).map(formatOutput).filter(Boolean).join('\n\n');
  }
  return String(value);
}

export function RunDialog({ workflowId, startNode, initialResult, onClose, onComplete }: Props) {
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
  const [result, setResult] = useState<WorkflowRunResult | null>(initialResult);
  const [error, setError] = useState<string | null>(null);

  const setValue = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const handleRun = async () => {
    const { payload, error: err } = buildPayload(inputs, values);
    if (err || !payload) {
      setError(err || '输入有误');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      const res = await runWorkflow(workflowId, payload);
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
