import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待运行',
  RUNNING: '运行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  SKIPPED: '跳过',
};

export function StartNode({ data }: NodeProps) {
  const d = data as {
    label?: string;
    inputs?: Array<{ name: string }>;
    runStatus?: string;
    hasError?: boolean;
  };
  return (
    <div
      className={`wf-node wf-node-start ${
        d.runStatus ? `is-${d.runStatus.toLowerCase()}` : ''
      } ${d.hasError ? 'has-error' : ''}`}
    >
      <Handle type="source" position={Position.Right} />
      {d.hasError && <span className="wf-node-error-badge">!</span>}
      {d.runStatus && (
        <span className={`wf-node-status-badge badge-${d.runStatus.toLowerCase()}`}>
          {STATUS_TEXT[d.runStatus] || d.runStatus}
        </span>
      )}
      <div className="wf-node-head">
        <span className="wf-node-icon" style={{ background: '#10b981' }}>
          ▶
        </span>
        <div>
          <div className="wf-node-title">{d.label || '开始'}</div>
          <div className="wf-node-sub">工作流入口</div>
        </div>
      </div>
      <div className="wf-node-body">
        {(d.inputs || []).map((i) => (
          <span className="wf-node-chip" key={i.name}>
            {i.name}
          </span>
        ))}
      </div>
    </div>
  );
}