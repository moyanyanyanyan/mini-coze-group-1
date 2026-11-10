// src/features/workflow-editor/components/nodes/LoopNode.tsx
import React from 'react';
import { Icon } from '@minicoze/ui/components';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export function LoopNode({ data }: NodeProps) {
  const d = data as {
    label?: string;
    maxIterations?: number;
    loopBodyStartId?: string;
    runStatus?: string;
    hasError?: boolean;
  };

  return (
    <div
      className={`wf-node wf-node-loop ${
        d.runStatus ? `is-${d.runStatus.toLowerCase()}` : ''
      } ${d.hasError ? 'has-error' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {d.hasError && <span className="wf-node-error-badge">!</span>}

      <div className="wf-node-head">
        <span className="wf-node-icon" style={{ background: '#0ea5e9' }}>
          <Icon name="repeat" />
        </span>
        <div>
          <div className="wf-node-title">{d.label || '循环'}</div>
          <div className="wf-node-sub">最多 {d.maxIterations ?? 3} 次</div>
        </div>
      </div>
      <div className="wf-node-body">
        <span className="wf-node-chip">
          循环体：{d.loopBodyStartId || '未设置'}
        </span>
      </div>
    </div>
  );
}
