// src/features/workflow-editor/components/PropertyPanel.tsx
import React, { useRef } from 'react';
import { useOverlayFocus } from '@minicoze/ui/hooks';
import { Icon } from '@minicoze/ui/components';
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
  const panel = useRef<HTMLElement>(null);
  const drawer = !!onClose && typeof window !== 'undefined' && window.innerWidth < 1200;
  useOverlayFocus(panel, drawer, () => onClose?.());
  if (!node) {
    return (
      <aside ref={panel} className="wf-prop-panel" role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} aria-label="节点配置">
        {onClose && <button className="ui-icon-button wf-panel-close" aria-label="关闭配置面板" onClick={onClose}><Icon name="close" /></button>}
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
    <aside ref={panel} className="wf-prop-panel" role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} aria-label="节点配置">
      <div className="wf-prop-head">
        {onClose && <button className="ui-icon-button wf-panel-close" aria-label="关闭配置面板" onClick={onClose}><Icon name="close" /></button>}
        <div className="wf-prop-title">
          {data.label || TYPE_LABEL[node.type ?? ''] || node.type || '节点'}
        </div>
        <details className="wf-prop-sub"><summary>技术信息</summary>节点 ID：{node.id}</details>
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
        <div className="wf-danger-zone"><button className="wf-btn wf-btn-outline wf-btn-danger" onClick={() => onDelete(node.id)}>删除节点</button></div>
      </div>
    </aside>
  );
}
