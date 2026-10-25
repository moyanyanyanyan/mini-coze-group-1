// src/features/workflow-editor/components/WorkflowEditorView.tsx
import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { navigate } from '../../../shared/routing/navigation';
import { getWorkflow, saveDraft } from '../services/workflow';
import type {
  NodeData,
  NodeType,
  WorkflowDefinition,
  WorkflowRunResult,
} from '../types/workflow';
import {
  canvasToDefinition,
  downloadDefinition,
} from '../utils/serialize';
import { StartNode } from './nodes/StartNode';
import { LlmNode } from './nodes/LlmNode';
import { EndNode } from './nodes/EndNode';
import { PropertyPanel } from './PropertyPanel';
import { NodePalette } from './NodePalette';
import { RunDialog } from './RunDialog';
import { ValidationDialog, type ValidationError } from './ValidationDialog';
import { frontendValidate } from '../utils/frontend-validate';
import { validateWorkflow } from '../services/workflow';

interface Props {
  workflowId: string;
}

const BASE = '/workspace/workflows';

const nodeTypes = {
  start: StartNode,
  llm: LlmNode,
  end: EndNode,
};


function definitionToFlow(def: WorkflowDefinition): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = def.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as unknown as Record<string, unknown>,
  }));
  const edges: Edge[] = def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));
  return { nodes, edges };
}

function defaultDataFor(type: NodeType): NodeData {
  if (type === 'start') {
    return {
      label: '开始',
      inputs: [{ name: 'query', type: 'string', required: true }],
    };
  }
  if (type === 'llm') {
    return {
      label: 'LLM',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: '',
      userPromptTemplate: '',
      outputs: [{ name: 'text', type: 'string' }],
    };
  }
  return {
    label: '结束',
    outputs: [{ name: 'result', type: 'string', valueFrom: '' }],
  };
}

function WorkflowEditorInner({ workflowId }: Props) {
  const reactFlow = useReactFlow();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 运行相关
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runStatusMap, setRunStatusMap] = useState<Record<string, string>>({});
  const [runResult, setRunResult] = useState<WorkflowRunResult | null>(null);

  const [validationOpen, setValidationOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: ValidationError[];
  }>({ valid: true, errors: [] });

  const handleValidate = async () => {
    // 1. 前端轻量校验
    const feErrors = frontendValidate(nodes, edges);
    if (feErrors.length > 0) {
      setValidationResult({ valid: false, errors: feErrors });
      setValidationOpen(true);
      return;
    }

    // 2. 调后端 /validate（Mock 也会走 services 层）
    try {
      const def = canvasToDefinition(nodes, edges);
      const res = await validateWorkflow(workflowId, def);
      setValidationResult(res);
      setValidationOpen(true);
    } catch (e: any) {
      setValidationResult({
        valid: false,
        errors: [
          {
            code: 'VALIDATE_REQUEST_FAILED',
            message: e.message || '校验请求失败',
          },
        ],
      });
      setValidationOpen(true);
    }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wf = await getWorkflow(workflowId);
        if (cancelled) return;
        setWorkflowName(wf.name);
        if (wf.draftDefinition) {
          const flow = definitionToFlow(wf.draftDefinition);
          setNodes(flow.nodes);
          setEdges(flow.edges);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 0) {
      const t = setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 100);
      return () => clearTimeout(t);
    }
  }, [nodes.length, reactFlow]);

  const handleAddNode = useCallback(
    (type: NodeType) => {
      if (nodes.some((n) => n.type === type)) {
        alert(`MVP 只支持一条 Start → LLM → End 单链路，${type} 节点已存在`);
        return;
      }

      const prefix = `node-${type}-`;
      const used = nodes
        .filter((n) => n.id.startsWith(prefix))
        .map((n) => parseInt(n.id.slice(prefix.length), 10))
        .filter((n) => !isNaN(n));
      const next = used.length ? Math.max(...used) + 1 : 1;
      const id = `${prefix}${next}`;

      const center = reactFlow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const newNode: Node = {
        id,
        type,
        position: center,
        data: defaultDataFor(type) as unknown as Record<string, unknown>,
      };

      setNodes((ns) => [...ns, newNode]);
      setSelectedId(id);
      setDirty(true);
      setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 80);
    },
    [nodes, reactFlow, setNodes],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setValidationResult({ valid: true, errors: [] });
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${Date.now()}`,
          source: params.source,
          target: params.target,
        },
      ]);
      setDirty(true);
    },
    [setEdges],
  );

  const selectedNode = selectedId
    ? nodes.find((n) => n.id === selectedId) || null
    : null;

  const handleNodeChange = (nodeId: string, data: NodeData) => {
    setValidationResult({ valid: true, errors: [] });
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId
          ? { ...n, data: data as unknown as Record<string, unknown> }
          : n,
      ),
    );
    setDirty(true);
  };

  const handleNodeDelete = (nodeId: string) => {
    setValidationResult({ valid: true, errors: [] });
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) =>
      es.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
    setSelectedId(null);
    setDirty(true);
    // 删节点后清掉该节点的运行状态
    setRunStatusMap((m) => {
      if (!(nodeId in m)) return m;
      const next = { ...m };
      delete next[nodeId];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const def = canvasToDefinition(nodes, edges);
      await saveDraft(workflowId, def);
      setDirty(false);
      alert('保存成功');
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const def = canvasToDefinition(nodes, edges);
    downloadDefinition(def, workflowName);
  };

  // 运行：先保存再打开输入表单
  const handleOpenRun = async () => {
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) {
      alert('请先添加 Start 节点');
      return;
    }
  
    // 1. 先保存
    if (dirty) {
      setSaving(true);
      try {
        const def = canvasToDefinition(nodes, edges);
        await saveDraft(workflowId, def);
        setDirty(false);
      } catch (e: any) {
        alert(`保存失败：${e.message || '未知错误'}`);
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
  
    // 2. 再校验
    const feErrors = frontendValidate(nodes, edges);
    if (feErrors.length > 0) {
      setValidationResult({ valid: false, errors: feErrors });
      setValidationOpen(true);
      return;
    }
    try {
      const def = canvasToDefinition(nodes, edges);
      const res = await validateWorkflow(workflowId, def);
      if (!res.valid) {
        setValidationResult(res);
        setValidationOpen(true);
        return;
      }
    } catch (e: any) {
      setValidationResult({
        valid: false,
        errors: [{ code: 'VALIDATE_FAILED', message: e.message || '校验失败' }],
      });
      setValidationOpen(true);
      return;
    }
  
    // 3. 通过才弹表单
    setShowRunDialog(true);
  };

  const handleRunComplete = (result: WorkflowRunResult) => {
    setRunResult(result);
    const map: Record<string, string> = {};
    result.nodeResults.forEach((nr) => {
      map[nr.nodeId] = nr.status;
    });
    setRunStatusMap(map);
  };

  const handleBack = () => {
    if (dirty && !confirm('有未保存的修改，确定离开？')) return;
    navigate(BASE);
  };

  // 传给 React Flow 的 nodes：合并运行状态
  // 校验错误节点集合
  const errorNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!validationResult.valid) {
      validationResult.errors.forEach((err) => {
        if (err.nodeId) set.add(err.nodeId);
      });
    }
    return set;
  }, [validationResult]);

  // 传给 React Flow 的 nodes：合并运行状态 + 校验错误
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          runStatus: runStatusMap[n.id],
          hasError: errorNodeIds.has(n.id),
        },
      })),
    [nodes, runStatusMap, errorNodeIds],
  );


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
              onClick={() => {
                setShowRunDialog(true);
              }}
              title="查看上次运行结果"
            >
              查看运行结果
            </button>
          )}
          <button className="wf-btn wf-btn-outline" onClick={handleExport}>
            导出 JSON
          </button>
          <button
            className="wf-btn wf-btn-outline"
            onClick={handleValidate}
          >
            校验
          </button>
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

      <div className="wf-editor-body">
        <NodePalette nodes={nodes} onAdd={handleAddNode} />

        <div className="wf-canvas-wrap">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
              setDirty(true);
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              setDirty(true);
            }}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
          >
            <Background gap={22} size={1} color="#dcdee5" />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <PropertyPanel
          node={selectedNode}
          onChange={handleNodeChange}
          onDelete={handleNodeDelete}
        />
      </div>

      {showRunDialog && (
        <RunDialog
          workflowId={workflowId}
          startNode={nodes.find((n) => n.type === 'start') || null}
          onClose={() => setShowRunDialog(false)}
          onComplete={handleRunComplete}
        />
      )}

      {validationOpen && (
        <ValidationDialog
          result={validationResult}
          onClose={() => setValidationOpen(false)}
          onLocate={(nodeId) => {
            setSelectedId(nodeId);
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
              reactFlow.setCenter(
                node.position.x + 110,
                node.position.y + 60,
                { zoom: 1, duration: 300 },
              );
            }
          }}
        />
      )}
    </section>
  );
}

export function WorkflowEditorView({ workflowId }: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner workflowId={workflowId} />
    </ReactFlowProvider>
  );
}