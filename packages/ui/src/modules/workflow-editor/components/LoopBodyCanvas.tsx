import React from 'react';
import { ReactFlow, Background, Controls, type Node, type Edge, type Connection, type OnNodesChange, type OnEdgesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Icon } from '../../../components';
import type { LoopNodeData } from '../types/workflow';
import { LlmNode } from './nodes/LlmNode';
import { ConditionNode } from './nodes/ConditionNode';
const nodeTypes = { llm: LlmNode, condition: ConditionNode };

export interface LoopBodyCanvasProps {
  propertyPanel: React.ReactNode;
  loopId: string;
  loopData: LoopNodeData;
  notice: string;
  nodes: Node[];
  edges: Edge[];
  setNotice: (value: string) => void;
  setSelectedId: (value: string | null) => void;
  onClose: () => void;
  handleClose: () => void;
  handleAddNode: (type: 'llm' | 'condition') => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
}

export function LoopBodyCanvas({
  propertyPanel,
  loopId,
  loopData,
  notice,
  nodes,
  edges,
  setNotice,
  setSelectedId,
  onClose,
  handleClose,
  handleAddNode,
  onNodesChange,
  onEdgesChange,
  onConnect,
}: LoopBodyCanvasProps) {
  return (
    <div className="wf-loop-editor-mask">
      <div className="wf-loop-editor">
        {notice && <div className="wf-notice" role="alert"><span>{notice}</span><button className="ui-icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><Icon name="close" /></button></div>}
        <header className="wf-loop-editor-header">
          <div>
            <h3 style={{ margin: 0 }}>编辑循环体</h3>
            <small style={{ color: '#86909c' }}>
              {loopId} ·{' '}
              {loopData.mode === 'count'
                ? `固定 ${loopData.count ?? 0} 次`
                : `遍历 ${loopData.items || '未设置'}`}
            </small>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="wf-btn wf-btn-outline" onClick={onClose}>
              取消
            </button>
            <button className="wf-btn wf-btn-primary" onClick={handleClose}>
              完成
            </button>
          </div>
        </header>

        <div className="wf-loop-editor-body">
          <aside className="wf-node-palette">
            <div className="wf-palette-title">循环体节点</div>
            <div className="wf-palette-hint">只能放 LLM / 条件</div>
            <button
              className="wf-palette-item"
              onClick={() => handleAddNode('llm')}
            >
              <span
                className="wf-palette-icon"
                style={{ background: '#4d53e8' }}
              >
                <Icon name="chat" />
              </span>
              <span className="wf-palette-text">
                <span className="wf-palette-label">LLM</span>
                <span className="wf-palette-desc">大模型调用</span>
              </span>
            </button>
            <button
              className="wf-palette-item"
              onClick={() => handleAddNode('condition')}
            >
              <span
                className="wf-palette-icon"
                style={{ background: '#f59e0b' }}
              >
                <Icon name="workflow" />
              </span>
              <span className="wf-palette-text">
                <span className="wf-palette-label">条件分支</span>
                <span className="wf-palette-desc">按条件走分支</span>
              </span>
            </button>
          </aside>

          <div className="wf-canvas-wrap" style={{ flex: 1 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
            >
              <Background gap={22} size={1} color="#dcdee5" />
              <Controls />
            </ReactFlow>
          </div>

          {propertyPanel}
        </div>
      </div>
    </div>
  );
}
