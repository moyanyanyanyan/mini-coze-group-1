import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待运行',
  RUNNING: '运行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  SKIPPED: '跳过',
};

export function EndNode({ data }: NodeProps) {
  const d = data as {
    label?: string;
    outputs?: Array<{ name: string }>;
    runStatus?: string;
    hasError?: boolean;
  };
  return (
    <div
      className={`wf-node wf-node-end ${
        d.runStatus ? `is-${d.runStatus.toLowerCase()}` : ''
      } ${d.hasError ? 'has-error' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      {d.hasError && <span className="wf-node-error-badge">!</span>}
      {d.runStatus && (
        <span className={`wf-node-status-badge badge-${d.runStatus.toLowerCase()}`}>
          {STATUS_TEXT[d.runStatus] || d.runStatus}
        </span>
      )}
      <div className="wf-node-head">
        <span className="wf-node-icon" style={{ background: '#86909c' }}>
          ■
        </span>
        <div>
          <div className="wf-node-title">{d.label || '结束'}</div>
          <div className="wf-node-sub">返回响应结果</div>
        </div>
      </div>
      <div className="wf-node-body">
        {(d.outputs || []).map((o) => (
          <span className="wf-node-chip" key={o.name}>
            {o.name}
          </span>
        ))}
      </div>
    </div>
  );
}