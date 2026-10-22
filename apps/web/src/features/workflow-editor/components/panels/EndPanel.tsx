// src/features/workflow-editor/components/panels/EndPanel.tsx
import React from 'react';
import type { EndNodeData, EndOutput } from '../../types/workflow';

interface Props {
  data: EndNodeData;
  onChange: (data: EndNodeData) => void;
}

export function EndPanel({ data, onChange }: Props) {
  const outputs = data.outputs || [];

  const updateOutput = (idx: number, patch: Partial<EndOutput>) => {
    const next = outputs.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ ...data, outputs: next });
  };

  const addOutput = () => {
    onChange({
      ...data,
      outputs: [
        ...outputs,
        { name: `result_${outputs.length + 1}`, type: 'string', valueFrom: '' },
      ],
    });
  };

  const removeOutput = (idx: number) => {
    onChange({ ...data, outputs: outputs.filter((_, i) => i !== idx) });
  };

  return (
    <div className="wf-form">
      <label className="wf-form-field">
        <span>节点名称</span>
        <input
          className="wf-input"
          value={data.label || ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
        />
      </label>

      <div className="wf-form-field">
        <div className="wf-form-label-row">
          <span>输出参数</span>
          <button className="wf-link-btn" onClick={addOutput} type="button">
            + 添加
          </button>
        </div>
        {outputs.length === 0 && (
          <div className="wf-form-empty">至少需要 1 个输出参数</div>
        )}
        {outputs.map((it, idx) => (
          <div className="wf-output-row" key={idx}>
            <input
              className="wf-input"
              value={it.name}
              onChange={(e) => updateOutput(idx, { name: e.target.value })}
              placeholder="输出名"
            />
            <input
              className="wf-input"
              value={it.valueFrom}
              onChange={(e) => updateOutput(idx, { valueFrom: e.target.value })}
              placeholder="node-llm-1.text"
            />
            <button
              className="wf-icon-btn wf-btn-danger"
              onClick={() => removeOutput(idx)}
              type="button"
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
        <small className="wf-form-help">
          valueFrom 格式：{'节点ID.字段名'}，不带花括号
        </small>
      </div>
    </div>
  );
}