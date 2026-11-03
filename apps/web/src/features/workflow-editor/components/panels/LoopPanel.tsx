// src/features/workflow-editor/components/panels/LoopPanel.tsx
import React from 'react';
import type { Node } from '@xyflow/react';
import type { LoopNodeData } from '../../types/workflow';

interface Props {
  data: LoopNodeData;
  nodes: Node[];
  onChange: (data: LoopNodeData) => void;
}

export function LoopPanel({ data, nodes, onChange }: Props) {
  const candidates = nodes.filter(
    (n) => n.type !== 'start' && n.type !== 'loop',
  );

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

      <label className="wf-form-field">
        <span>最大迭代次数</span>
        <input
          className="wf-input"
          type="number"
          min={1}
          max={100}
          value={data.maxIterations ?? 3}
          onChange={(e) =>
            onChange({ ...data, maxIterations: Number(e.target.value) })
          }
        />
      </label>

      <label className="wf-form-field">
        <span>循环体起点</span>
        <select
          className="wf-input"
          value={data.loopBodyStartId || ''}
          onChange={(e) =>
            onChange({ ...data, loopBodyStartId: e.target.value || undefined })
          }
        >
          <option value="">未设置</option>
          {candidates.map((n) => (
            <option key={n.id} value={n.id}>
              {n.id}
            </option>
          ))}
        </select>
        <small className="wf-form-help">
          从该节点开始，沿连线走到 loop 节点为止，重复执行 maxIterations 次。
        </small>
      </label>
    </div>
  );
}