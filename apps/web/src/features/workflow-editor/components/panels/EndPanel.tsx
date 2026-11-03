// src/features/workflow-editor/components/panels/EndPanel.tsx
import React from 'react';
import type { Node } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import type { EndNodeData, EndOutput } from '../../types/workflow';
import { VariableSelect } from '../VariableSelect';
import { getUpstreamFields } from '../../utils/upstream';

interface Props {
  data: EndNodeData;
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  onChange: (data: EndNodeData) => void;
}

export function EndPanel({ data, nodeId, nodes, edges, onChange }: Props) {
  const outputs = data.outputs || [];
  const upstream = getUpstreamFields(nodes, edges, nodeId);
  
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
        { name: `result_${outputs.length + 1}`, type: 'string', valueFrom: '' },
      ],
    });
  };

  const removeOutput = (idx: number) => {
    onChange({ ...data, outputs: outputs.filter((_, i) => i !== idx) });
  };

  return (
    <div className="wf-form">
      {/* 节点名称不变 */}

      <div className="wf-form-field">
        <div className="wf-form-label-row">
          <span>输出参数</span>
          <button className="wf-link-btn" onClick={addOutput} type="button">
            + 添加
          </button>
        </div>
        {outputs.map((it, idx) => (
          <div className="wf-output-row" key={idx}>
            <input
              className="wf-input"
              value={it.name}
              onChange={(e) => updateOutput(idx, { name: e.target.value })}
              placeholder="输出名"
            />
            <VariableSelect
              value={it.valueFrom}
              options={upstream}
              placeholder="选择上游字段"
              onChange={(v) => updateOutput(idx, { valueFrom: v })}
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
          值来源格式：节点ID.字段名，不带花括号
        </small>
      </div>
    </div>
  );
}