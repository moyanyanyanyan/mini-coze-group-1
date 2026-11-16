// src/features/workflow-editor/components/nodes/ConditionNode.tsx
import React from 'react';
import { Icon } from '../../../../components';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ConditionNodeData } from '../../types/workflow';

export function ConditionNode({ data }: NodeProps) {
  const d = data as {
    label?: string;
    branches?: ConditionNodeData['branches'];
    runStatus?: string;
    hasError?: boolean;
  };
  const branches = d.branches || [];

  // 每个分支 + else，总共 N+1 个出口
  const ports = [
    ...branches.map((b) => ({ id: b.id, label: b.id })),
    { id: 'else', label: 'else' },
  ];

  return (
    <div
      className={`wf-node wf-node-condition ${
        d.runStatus ? `is-${d.runStatus.toLowerCase()}` : ''
      } ${d.hasError ? 'has-error' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      {d.hasError && <span className="wf-node-error-badge">!</span>}

      <div className="wf-node-head">
        <span className="wf-node-icon" style={{ background: '#f59e0b' }}>
          <Icon name="workflow" />
        </span>
        <div>
          <div className="wf-node-title">{d.label || '条件判断'}</div>
          <div className="wf-node-sub">{branches.length} 分支 + else</div>
        </div>
      </div>

      <div className="wf-node-body">
        {ports.map((p) => (
          <span className="wf-node-chip" key={p.id}>
            {p.label}
          </span>
        ))}
      </div>

      {/* 端口按 10% ~ 90% 均分 */}
      {ports.map((p, idx) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={Position.Right}
          style={{
            top: `${((idx + 1) / (ports.length + 1)) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
