// src/features/workflow-editor/components/PropertyPanel.tsx
import React, { useRef } from 'react';
import { useOverlayFocus } from '../../../hooks';
import { Icon } from '../../../components';
import type { Node } from '@xyflow/react';
import type {
  NodeData,
  EndNodeData,
  LoopNodeData,
  LlmNodeData,
} from '../types/workflow';
import { StartPanel } from './panels/StartPanel';
import { LlmPanel } from './panels/LlmPanel';
import { EndPanel } from './panels/EndPanel';
import { LoopPanel } from './panels/LoopPanel';
import type { UpstreamField } from '../types/fields';

interface Props {
  onClose?: () => void;
  node: Node | null;
  upstream: UpstreamField[];
  outputCandidates: UpstreamField[][];
  bodyCandidates: { ref: string }[];
  conditionPanel: React.ReactNode;
  onChange: (nodeId: string, data: NodeData) => void;
  onDelete: (nodeId: string) => void;
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
  node, upstream, outputCandidates, bodyCandidates, conditionPanel, onChange, onDelete, onEditLoopBody, onClose,
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
            upstream={upstream}
            onChange={handleChange}
          />
        )}
        {node.type === 'end' && (
          <EndPanel
            data={data as EndNodeData}
            outputCandidates={outputCandidates}
            onChange={handleChange}
          />
        )}
        {node.type === 'condition' && conditionPanel}
        {node.type === 'loop' && (
          <LoopPanel
            data={data as LoopNodeData}
            nodeId={node.id}
            bodyCandidates={bodyCandidates}
            onChange={handleChange}
            onEditBody={onEditLoopBody} 
          />
        )}
        <div className="wf-danger-zone"><button className="wf-btn wf-btn-outline wf-btn-danger" onClick={() => onDelete(node.id)}>删除节点</button></div>
      </div>
    </aside>
  );
}
