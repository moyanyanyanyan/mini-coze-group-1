// src/features/workflow-editor/components/panels/EndPanel.tsx
import React from 'react';
import type {
  EndNodeData,
  EndOutput,
  FieldType,
} from '../../types/workflow';
import { MultiVariableSelect } from '../MultiVariableSelect';
import type { UpstreamField } from '../../types/fields';

interface Props {
  data: EndNodeData;
  outputCandidates: UpstreamField[][];
  onChange: (data: EndNodeData) => void;
}

export function EndPanel({ data, outputCandidates, onChange }: Props) {
  const outputs = data.outputs || [];

  const updateOutput = (idx: number, patch: Partial<EndOutput>) => {
    onChange({
      ...data,
      outputs: outputs.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    });
  };

  const addOutput = () => {
    onChange({
      ...data,
      outputs: [
        ...outputs,
        { name: `result_${outputs.length + 1}`, type: 'string', valueFrom: [] },
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

        {outputs.map((it, idx) => {
          // 旧数据兼容：string → [string]
          const valueArr: string[] = Array.isArray(it.valueFrom)
            ? it.valueFrom
            : it.valueFrom
            ? [it.valueFrom]
            : [];

          // 类型严格匹配
          const typeMatched = outputCandidates[idx];

          return (
            <div key={idx} className="wf-end-output-card">
              <div className="wf-end-output-head">
                <input
                  className="wf-input"
                  value={it.name}
                  onChange={(e) => updateOutput(idx, { name: e.target.value })}
                  placeholder="输出名"
                />
                <select
                  className="wf-input"
                  value={it.type}
                  onChange={(e) =>
                    updateOutput(idx, {
                      type: e.target.value as FieldType,
                      valueFrom: [], // 改类型清空候选
                    })
                  }
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="array<string>">array&lt;string&gt;</option>
                  <option value="array<number>">array&lt;number&gt;</option>
                  <option value="array<boolean>">array&lt;boolean&gt;</option>
                </select>
                <button
                  className="wf-icon-btn wf-btn-danger"
                  onClick={() => removeOutput(idx)}
                  type="button"
                  title="删除"
                >
                  ×
                </button>
              </div>

              <MultiVariableSelect
                value={valueArr}
                options={typeMatched}
                onChange={(v) => updateOutput(idx, { valueFrom: v })}
              />

              <small className="wf-form-help">
                按优先级勾选，分支内的节点放前面；运行时取第一个已执行成功的候选
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}