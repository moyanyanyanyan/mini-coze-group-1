// src/features/workflow-editor/components/PropertyPanel.tsx
import React from 'react';
import type { Node } from '@xyflow/react';
import type { NodeData } from '../types/workflow';
import { StartPanel } from './panels/StartPanel';
import { LlmPanel } from './panels/LlmPanel';
import { EndPanel } from './panels/EndPanel';

interface Props {
  node: Node | null;
  onChange: (nodeId: string, data: NodeData) => void;
  onDelete: (nodeId: string) => void;
}

export function PropertyPanel({ node, onChange, onDelete }: Props) {
  if (!node) {
    return (
      <aside className="wf-prop-panel">
        <div className="wf-prop-empty">
          <p>点击画布中的节点</p>
          <p style={{ fontSize: 12, color: '#86909c' }}>在此查看和编辑配置</p>
        </div>
      </aside>
    );
  }

  const data = node.data as unknown as NodeData;
  const handleChange = (next: NodeData) => onChange(node.id, next);

  return (
    <aside className="wf-prop-panel">
      <div className="wf-prop-head">
        <div className="wf-prop-title">
          {node.type === 'start' ? '开始' : node.type === 'llm' ? 'LLM' : '结束'}
        </div>
        <div className="wf-prop-sub">节点 ID：{node.id}</div>
        <button
          className="wf-btn wf-btn-outline wf-btn-danger"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => onDelete(node.id)}
        >
          删除节点
        </button>
      </div>

      <div className="wf-prop-body">
        {node.type === 'start' && (
          <StartPanel
            data={data as Parameters<typeof StartPanel>[0]['data']}
            onChange={handleChange}
          />
        )}
        {node.type === 'llm' && (
          <LlmPanel
            data={data as Parameters<typeof LlmPanel>[0]['data']}
            onChange={handleChange}
          />
        )}
        {node.type === 'end' && (
          <EndPanel
            data={data as Parameters<typeof EndPanel>[0]['data']}
            onChange={handleChange}
          />
        )}
      </div>
    </aside>
  );
}