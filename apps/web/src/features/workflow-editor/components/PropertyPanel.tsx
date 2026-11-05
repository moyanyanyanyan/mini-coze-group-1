// src/features/workflow-editor/components/PropertyPanel.tsx
import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import type {
  NodeData,
  EndNodeData,
  ConditionNodeData,
  LoopNodeData,
  LlmNodeData,
} from '../types/workflow';
import { StartPanel } from './panels/StartPanel';
import { LlmPanel } from './panels/LlmPanel';
import { EndPanel } from './panels/EndPanel';
import { ConditionPanel } from './panels/ConditionPanel';
import { LoopPanel } from './panels/LoopPanel';
import { type LoopContext } from '../utils/upstream';

interface Props {
  onClose?: () => void;
  node: Node | null;
  nodes: Node[];
  edges: Edge[];
  onChange: (nodeId: string, data: NodeData) => void;
  onDelete: (nodeId: string) => void;
  loopContext?: LoopContext;     
  onEditLoopBody?: (loopId: string) => void; 
}

const TYPE_LABEL: Record<string, string> = {
  start: '开始',
  llm: 'LLM',
  condition: '条件分支',
  loop: '循环',
  end: '结束',
};

export function PropertyPanel({
  node, nodes, edges, loopContext, onChange, onDelete, onEditLoopBody, onClose,
}: Props) {
  if (!node) {
    return (
      <aside className="wf-prop-panel">
        {onClose && <button className="wf-btn wf-btn-outline" onClick={onClose}>关闭配置面板</button>}
        <div className="wf-prop-empty">
          <p>点击画布中的节点</p>
          <p style={{ fontSize: 12, color: '#86909c' }}>
            在此查看和编辑配置
          </p>
        </div>
      </aside>
    );
  }

  const data = node.data as unknown as NodeData;
  const handleChange = (next: NodeData) => onChange(node.id, next);

  return (
    <aside className="wf-prop-panel">
      <div className="wf-prop-head">
        {onClose && <button className="wf-btn wf-btn-outline" onClick={onClose}>关闭配置面板</button>}
        <div className="wf-prop-title">
          {TYPE_LABEL[node.type ?? ''] || node.type || '节点'}
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
            data={data as LlmNodeData}
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            loopContext={loopContext} 
            onChange={handleChange}
          />
        )}
        {node.type === 'end' && (
          <EndPanel
            data={data as EndNodeData}
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            onChange={handleChange}
          />
        )}
        {node.type === 'condition' && (
          <ConditionPanel
            data={data as ConditionNodeData}
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            loopContext={loopContext}    
            onChange={handleChange}
          />
        )}
        {node.type === 'loop' && (
          <LoopPanel
            data={data as LoopNodeData}
            nodeId={node.id}
            nodes={nodes}
            onChange={handleChange}
            onEditBody={onEditLoopBody} 
          />
        )}
      </div>
    </aside>
  );
}
