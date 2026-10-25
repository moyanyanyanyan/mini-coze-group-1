// src/features/workflow-editor/components/panels/StartPanel.tsx
import React from 'react';
import type { StartNodeData, StartInput } from '../../types/workflow';

interface Props {
  data: StartNodeData;
  onChange: (data: StartNodeData) => void;
}

export function StartPanel({ data, onChange }: Props) {
  const inputs = data.inputs || [];

  const updateInput = (idx: number, patch: Partial<StartInput>) => {
    const next = inputs.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ ...data, inputs: next });
  };

  const addInput = () => {
    onChange({
      ...data,
      inputs: [
        ...inputs,
        { name: `var_${inputs.length + 1}`, type: 'string', required: false },
      ],
    });
  };

  const removeInput = (idx: number) => {
    onChange({ ...data, inputs: inputs.filter((_, i) => i !== idx) });
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
          <span>输入参数</span>
          <button className="wf-link-btn" onClick={addInput} type="button">
            + 添加
          </button>
        </div>
        {inputs.length === 0 && (
          <div className="wf-form-empty">至少需要 1 个输入参数</div>
        )}
        {inputs.map((it, idx) => (
          <div className="wf-input-row" key={idx}>
            <input
              className="wf-input"
              value={it.name}
              onChange={(e) => updateInput(idx, { name: e.target.value })}
              placeholder="变量名"
            />
            <select
              className="wf-input"
              value={it.type}
              onChange={(e) =>
                updateInput(idx, { type: e.target.value as StartInput['type'] })
              }
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
            <label className="wf-checkbox">
              <input
                type="checkbox"
                checked={it.required}
                onChange={(e) => updateInput(idx, { required: e.target.checked })}
              />
              必填
            </label>
            <button
              className="wf-icon-btn wf-btn-danger"
              onClick={() => removeInput(idx)}
              type="button"
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}