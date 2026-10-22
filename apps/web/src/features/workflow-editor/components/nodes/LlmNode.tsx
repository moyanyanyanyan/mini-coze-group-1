import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待运行',
  RUNNING: '运行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  SKIPPED: '跳过',
};

export function LlmNode({ data }: NodeProps) {
  const d = data as {
    label?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    runStatus?: string;
    hasError?: boolean;
  };
  return (
    <div
      className={`wf-node wf-node-llm ${
        d.runStatus ? `is-${d.runStatus.toLowerCase()}` : ''
      } ${d.hasError ? 'has-error' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {d.hasError && <span className="wf-node-error-badge">!</span>}
      {d.runStatus && (
        <span className={`wf-node-status-badge badge-${d.runStatus.toLowerCase()}`}>
          {STATUS_TEXT[d.runStatus] || d.runStatus}
        </span>
      )}
      <div className="wf-node-head">
        <span className="wf-node-icon" style={{ background: '#4d53e8' }}>
          🤖
        </span>
        <div>
          <div className="wf-node-title">{d.label || 'LLM'}</div>
          <div className="wf-node-sub">{d.model || 'deepseek-chat'}</div>
        </div>
      </div>
      <div className="wf-node-body">
        <span className="wf-node-chip">T {d.temperature ?? 0.7}</span>
        <span className="wf-node-chip">Max {d.maxTokens ?? 2048}</span>
      </div>
    </div>
  );
}