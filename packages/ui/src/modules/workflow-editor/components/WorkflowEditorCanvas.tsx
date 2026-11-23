import React from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, type Connection, type OnNodesChange, type OnEdgesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../workflow-editor.css';
import { Icon, ActionMenu } from '../../../components';
import type { NodeType, WorkflowRunResult } from '../types/workflow';
import { NodePalette } from './NodePalette';
import { ValidationDialog, type ValidationError } from './ValidationDialog';
import { StartNode } from './nodes/StartNode';
import { LlmNode } from './nodes/LlmNode';
import { EndNode } from './nodes/EndNode';
import { ConditionNode } from './nodes/ConditionNode';
import { LoopNode } from './nodes/LoopNode';

const miniMapColors: Record<string, string> = {
  start: '#10b981', llm: '#8066d9', condition: '#e8a632', loop: '#329dcc', end: '#8792a4',
};
const miniMapNodeColor = (node: Node) => miniMapColors[node.type ?? ''] ?? '#8792a4';

const nodeTypes = {
  start: StartNode,
  llm: LlmNode,
  end: EndNode,
  condition: ConditionNode,
  loop: LoopNode,
};


export interface WorkflowEditorCanvasProps {
  propertyPanel: React.ReactNode;
  loading: boolean;
  error: string | null;
  workflowName: string;
  dirty: boolean;
  saving: boolean;
  notice: string;
  confirmation: React.ReactNode;
  runResult: WorkflowRunResult | null;
  leftOpen: boolean;
  rightOpen: boolean;
  nodes: Node[];
  displayNodes: Node[];
  edges: Edge[];
  validationOpen: boolean;
  validationResult: { valid: boolean; errors: ValidationError[] };
  runDialogContent: React.ReactNode;
  loopEditor: React.ReactNode;
  handleBack: () => void;
  handleValidate: () => void;
  handleExport: () => void;
  handleOpenRun: () => void;
  handleSave: () => void;
  handleAddNode: (type: NodeType) => void;
  handleLocate: (id: string) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  setRunDialog: (value: 'result') => void;
  setNotice: (value: string) => void;
  setLeftOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedId: (value: string | null) => void;
  setValidationOpen: (value: boolean) => void;
}

export function WorkflowEditorCanvas({
  propertyPanel,
  loading,
  error,
  workflowName,
  dirty,
  saving,
  notice,
  confirmation,
  runResult,
  leftOpen,
  rightOpen,
  nodes,
  displayNodes,
  edges,
  validationOpen,
  validationResult,
  runDialogContent,
  loopEditor,
  handleBack,
  handleValidate,
  handleExport,
  handleOpenRun,
  handleSave,
  handleAddNode,
  handleLocate,
  onNodesChange,
  onEdgesChange,
  onConnect,
  setRunDialog,
  setNotice,
  setLeftOpen,
  setRightOpen,
  setSelectedId,
  setValidationOpen,
}: WorkflowEditorCanvasProps) {
  if (loading) {
    return (
      <div className="wf-editor-page">
        <div className="wf-empty">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wf-editor-page">
        <div className="wf-empty">
          <p>{error}</p>
          <button className="wf-btn wf-btn-outline" onClick={handleBack}>
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="wf-editor-page">
      {confirmation}
      <header className="wf-editor-header">
        <button className="wf-btn wf-btn-outline" onClick={handleBack}>
          ← 返回
        </button>
        <div className="wf-editor-title">
          {workflowName || '未命名工作流'}
          {dirty && <span className="wf-dirty-dot" title="有未保存修改">●</span>}
        </div>
        <div className="wf-editor-actions">
          {runResult && (
            <button
              className="wf-btn wf-btn-outline"
              onClick={() => setRunDialog('result')}
              title="查看上次运行结果"
            >
              查看运行结果
            </button>
          )}
          <ActionMenu><button onClick={handleValidate}>校验工作流</button><button onClick={handleExport}>导出 JSON</button></ActionMenu>
          <button
            className="wf-btn wf-btn-outline"
            onClick={handleOpenRun}
            disabled={saving}
          >
            运行
          </button>
          <button
            className="wf-btn wf-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </header>
      {notice && <div className="wf-notice" role="status"><span>{notice}</span><button className="ui-icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><Icon name="close" /></button></div>}

      <div className="wf-editor-body">
        {leftOpen && <NodePalette nodes={nodes} onAdd={handleAddNode} onClose={() => setLeftOpen(false)} />}

        <div className="wf-canvas-wrap">
          <button
            className="wf-side-toggle wf-side-toggle-left"
            onClick={() => setLeftOpen((v) => !v)}
            title={leftOpen ? '收起节点库' : '展开节点库'}
          >
            <Icon name="plus" /><span className="wf-toggle-label">节点库</span>
          </button>
          <button
            className="wf-side-toggle wf-side-toggle-right"
            onClick={() => setRightOpen((v) => !v)}
            title={rightOpen ? '收起配置面板' : '展开配置面板'}
          >
            <Icon name="edit" /><span className="wf-toggle-label">节点配置</span>
          </button>

          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedId(node.id);
              if (!rightOpen) setRightOpen(true);  // 点节点自动展开右侧
            }}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
          >
            <Background gap={22} size={1} color="#dcdee5" />
            <Controls />
            <MiniMap
              className="wf-minimap"
              ariaLabel="工作流缩略图"
              style={{ width: 156, height: 94 }}
              nodeColor={miniMapNodeColor}
              maskColor="rgba(111, 101, 161, 0.12)"
              maskStrokeColor="#c6bfdf"
              maskStrokeWidth={1}
              pannable
            />
          </ReactFlow>
        </div>

        {rightOpen && propertyPanel}
      </div>

      {runDialogContent}

      {validationOpen && (
        <ValidationDialog
          result={validationResult}
          onClose={() => setValidationOpen(false)}
          onLocate={handleLocate}
        />
      )}

      {loopEditor}


    </section>
  );
}
