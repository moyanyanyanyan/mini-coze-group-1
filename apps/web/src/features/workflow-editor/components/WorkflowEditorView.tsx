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
import { getWorkflow, saveDraft, validateWorkflow } from '../services/workflow';
import type {
  NodeData,
  NodeType,
  WorkflowDefinition,
  WorkflowRunResult,
  ConditionNodeData,
  ConditionBranch,
} from '../types/workflow';
import { canvasToDefinition, downloadDefinition } from '../utils/serialize';
import { StartNode } from './nodes/StartNode';
import { LlmNode } from './nodes/LlmNode';
import { EndNode } from './nodes/EndNode';
import { ConditionNode } from './nodes/ConditionNode';
import { LoopNode } from './nodes/LoopNode';
import { PropertyPanel } from './PropertyPanel';
import { NodePalette } from './NodePalette';
import { RunDialog } from './RunDialog';
import { ValidationDialog, type ValidationError } from './ValidationDialog';
import { frontendValidate } from '../utils/frontend-validate';
import { LoopBodyEditor } from './LoopBodyEditor';
import type { LoopNodeData } from '../types/workflow';

interface Props {
  workflowId: string;
}

const BASE = '/workspace/workflows';

const nodeTypes = {
  start: StartNode,
  llm: LlmNode,
  end: EndNode,
  condition: ConditionNode,
  loop: LoopNode,
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
  // 保留 sourceHandle / targetHandle，多端口才能还原
  const edges: Edge[] = def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
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
      model: 'deepseek-flash',
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: '',
      userPromptTemplate: '',
      outputs: [{ name: 'text', type: 'string' }],
    };
  }
  if (type === 'condition') {
    const branches: ConditionBranch[] = [
      { id: 'b1', logic: 'and', conditions: [] },
    ];
    return { label: '条件判断', branches };
  }
  if (type === 'loop') {
    return {
      label: '循环',
      mode: 'count',
      count: 3,
      body: { nodes: [], edges: [] },
      outputs: [
        { name: 'results', type: 'array<string>', valueFrom: [] },
      ],
    };
  }
  return {
    label: '结束',
    outputs: [{ name: 'result', type: 'string', valueFrom: [] }],
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
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= 1200);
  const [rightOpen, setRightOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runStatusMap, setRunStatusMap] = useState<Record<string, string>>({});
  const [runResult, setRunResult] = useState<WorkflowRunResult | null>(null);

  const [validationOpen, setValidationOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: ValidationError[];
  }>({ valid: true, errors: [] });

  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);

  const handleValidate = async () => {
    const feErrors = frontendValidate(nodes, edges);
    if (feErrors.length > 0) {
      setValidationResult({ valid: false, errors: feErrors });
      setValidationOpen(true);
      return;
    }
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
      // 只有 start / end 限制单节点
      if (
        (type === 'start' || type === 'end') &&
        nodes.some((n) => n.type === type)
      ) {
        alert(`${type === 'start' ? '开始' : '结束'}节点只能有 1 个`);
        return;
      }

      // 节点总数 ≤ 50
      if (nodes.length >= 50) {
        alert('节点总数不能超过 50 个');
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

      const sourceNode = nodes.find((n) => n.id === params.source);

      // 普通节点（非 condition / loop）只能有 1 条出线
      if (
        sourceNode &&
        sourceNode.type !== 'condition' &&
        sourceNode.type !== 'loop'
      ) {
        const existing = edges.filter((e) => e.source === params.source);
        if (existing.length >= 1) {
          alert('普通节点只能有 1 条出线');
          return;
        }
      }

      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${crypto.randomUUID()}`,
          source: params.source,
          target: params.target,
          sourceHandle: params.sourceHandle ?? undefined,
          targetHandle: params.targetHandle ?? undefined,
        },
      ]);
      setDirty(true);
    },
    [nodes, edges, setEdges],
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

    // 条件节点：删分支时同步删该出口上的连线
    if ('branches' in data) {
      const condData = data as ConditionNodeData;
      const branchIds = new Set([
        ...condData.branches.map((b) => b.id),
        'else',
      ]);
      setEdges((es) =>
        es.filter(
          (e) =>
            !(
              e.source === nodeId &&
              e.sourceHandle &&
              !branchIds.has(e.sourceHandle)
            ),
        ),
      );
    }

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
    setRunStatusMap((m) => {
      if (!(nodeId in m)) return m;
      const next = { ...m };
      delete next[nodeId];
      return next;
    });
  };

  const handleSave = async () => {
    const hasEmptyEndOutput = nodes
      .filter((n) => n.type === 'end')
      .some((n) => {
        const d = n.data as { outputs?: Array<{ valueFrom?: string | string[] }> };
        return (d.outputs || []).some((o) => {
          const arr = Array.isArray(o.valueFrom)
            ? o.valueFrom
            : o.valueFrom
              ? [o.valueFrom]
              : [];
          return arr.length === 0;
        });
      });

    if (hasEmptyEndOutput) {
      alert('End 节点的每个输出至少需要勾选一个候选');
      return;
    }
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

  const handleOpenRun = async () => {
    const hasEmptyEndOutput = nodes
      .filter((n) => n.type === 'end')
      .some((n) => {
        const d = n.data as { outputs?: Array<{ valueFrom?: string | string[] }> };
        return (d.outputs || []).some((o) => {
          const arr = Array.isArray(o.valueFrom)
            ? o.valueFrom
            : o.valueFrom
              ? [o.valueFrom]
              : [];
          return arr.length === 0;
        });
      });

    if (hasEmptyEndOutput) {
      alert('End 节点的每个输出至少需要勾选一个候选');
      return;
    }
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) {
      alert('请先添加 Start 节点');
      return;
    }

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
        errors: [
          { code: 'VALIDATE_FAILED', message: e.message || '校验失败' },
        ],
      });
      setValidationOpen(true);
      return;
    }

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

  const errorNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!validationResult.valid) {
      validationResult.errors.forEach((err) => {
        if (err.nodeId) set.add(err.nodeId);
      });
    }
    return set;
  }, [validationResult]);

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
              onClick={() => setShowRunDialog(true)}
              title="查看上次运行结果"
            >
              查看运行结果
            </button>
          )}
          <button className="wf-btn wf-btn-outline" onClick={handleExport}>
            导出 JSON
          </button>
          <button className="wf-btn wf-btn-outline" onClick={handleValidate}>
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
        {leftOpen && <NodePalette nodes={nodes} onAdd={handleAddNode} onClose={() => setLeftOpen(false)} />}

        <div className="wf-canvas-wrap">
          <button
            className="wf-side-toggle wf-side-toggle-left"
            onClick={() => setLeftOpen((v) => !v)}
            title={leftOpen ? '收起节点库' : '展开节点库'}
          >
            {leftOpen ? '‹' : '›'}
          </button>
          <button
            className="wf-side-toggle wf-side-toggle-right"
            onClick={() => setRightOpen((v) => !v)}
            title={rightOpen ? '收起配置面板' : '展开配置面板'}
          >
            {rightOpen ? '›' : '‹'}
          </button>

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
            onNodeClick={(_, node) => {
              setSelectedId(node.id);
              if (!rightOpen) setRightOpen(true);  // 点节点自动展开右侧
            }}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
          >
            <Background gap={22} size={1} color="#dcdee5" />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {rightOpen && (
          <PropertyPanel
            onClose={() => setRightOpen(false)}
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            onChange={handleNodeChange}
            onDelete={handleNodeDelete}
            onEditLoopBody={(loopId) => setEditingLoopId(loopId)}
          />
        )}
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

      {editingLoopId && (() => {
        const loopNode = nodes.find((n) => n.id === editingLoopId);
        if (!loopNode || loopNode.type !== 'loop') return null;
        const loopData = loopNode.data as unknown as LoopNodeData;
        return (
          <LoopBodyEditor
            loopId={editingLoopId}
            loopData={loopData}
            mainNodes={nodes}
            mainEdges={edges}
            onChange={(newData) => {
              handleNodeChange(editingLoopId, newData);
            }}
            onClose={() => setEditingLoopId(null)}
          />
        );
      })()}

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
