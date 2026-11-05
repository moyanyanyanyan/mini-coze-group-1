// src/features/workflow-editor/components/LoopBodyEditor.tsx
import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  LoopNodeData,
  LoopBody,
  NodeData,
  ConditionNodeData,
  NodeType,
} from '../types/workflow';
import { getUpstreamNodes, type LoopContext } from '../utils/upstream';
import { LlmNode } from './nodes/LlmNode';
import { ConditionNode } from './nodes/ConditionNode';
import { PropertyPanel } from './PropertyPanel';

interface Props {
  loopId: string;
  loopData: LoopNodeData;
  mainNodes: Node[];
  mainEdges: Edge[];
  onChange: (data: LoopNodeData) => void;
  onClose: () => void;
}

const nodeTypes = {
  llm: LlmNode,
  condition: ConditionNode,
};

/** 收集主画布所有已用 id（含所有 loop 的 body） */
function collectAllIds(mainNodes: Node[], currentNodeId: string | null = null): Set<string> {
  const used = new Set<string>();
  mainNodes.forEach((n) => {
    used.add(n.id);
    if (n.type === 'loop') {
      const body = (n.data as { body?: LoopBody }).body;
      body?.nodes?.forEach((bn) => used.add(bn.id));
    }
  });
  if (currentNodeId) used.delete(currentNodeId);
  return used;
}

function defaultBodyNodeData(type: 'llm' | 'condition'): NodeData {
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
  return {
    label: '条件判断',
    branches: [{ id: 'b1', logic: 'and', conditions: [] }],
  };
}

function LoopBodyEditorInner({
  loopId, loopData, mainNodes, mainEdges, onChange, onClose,
}: Props) {
  const reactFlow = useReactFlow();

  // 初始化：从 loop.body 读
  const initialNodes: Node[] = useMemo(
    () =>
      (loopData.body?.nodes || []).map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as unknown as Record<string, unknown>,
      })),
    // 只在打开时初始化一次，不随 loopData 变化重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges: Edge[] = useMemo(
    () =>
      (loopData.body?.edges || []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (nodes.length > 0) {
      const t = setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 100);
      return () => clearTimeout(t);
    }
  }, [nodes.length, reactFlow]);

  const handleAddNode = useCallback(
    (type: 'llm' | 'condition') => {
      const allUsed = collectAllIds(mainNodes);
      nodes.forEach((n) => allUsed.add(n.id));

      const prefix = `node-${type}-body-`;
      let i = 1;
      while (allUsed.has(`${prefix}${i}`)) i++;
      const id = `${prefix}${i}`;

      const center = reactFlow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const newNode: Node = {
        id,
        type,
        position: center,
        data: defaultBodyNodeData(type) as unknown as Record<string, unknown>,
      };
      setNodes((ns) => [...ns, newNode]);
      setSelectedId(id);
      setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 80);
    },
    [nodes, mainNodes, reactFlow, setNodes],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      if (sourceNode && sourceNode.type !== 'condition') {
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
    },
    [nodes, edges, setEdges],
  );

  const selectedNode = selectedId
    ? nodes.find((n) => n.id === selectedId) || null
    : null;

  const handleNodeChange = (nodeId: string, data: NodeData) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId
          ? { ...n, data: data as unknown as Record<string, unknown> }
          : n,
      ),
    );
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
  };

  const handleNodeDelete = (nodeId: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) =>
      es.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
    setSelectedId(null);
  };

  // loop 节点在主画布上的上游节点
  const loopUpstreamNodes = useMemo(
    () => getUpstreamNodes(mainNodes, mainEdges, loopId),
    [mainNodes, mainEdges, loopId],
  );

  const loopContext: LoopContext = useMemo(
    () => ({
      loopId,
      mode: loopData.mode,
      externalNodes: loopUpstreamNodes,
    }),
    [loopId, loopData.mode, loopUpstreamNodes],
  );

  // 关闭：校验 + 同步回主画布
  const handleClose = () => {
    if (nodes.length > 0) {
      const inDegree = new Map<string, number>();
      nodes.forEach((n) => inDegree.set(n.id, 0));
      edges.forEach((e) => {
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      });
      const roots = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);
      if (roots.length !== 1) {
        alert(
          `循环体必须恰好有 1 个无入线的起点节点，当前有 ${roots.length} 个`,
        );
        return;
      }
    }

    const body: LoopBody = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as NodeType,
        position: n.position,
        data: n.data as unknown as NodeData,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    };

    onChange({ ...loopData, body });
    onClose();
  };

  return (
    <div className="wf-loop-editor-mask">
      <div className="wf-loop-editor">
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
                🤖
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
                ⑂
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

          <PropertyPanel
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            loopContext={loopContext}
            onChange={handleNodeChange}
            onDelete={handleNodeDelete}
          />
        </div>
      </div>
    </div>
  );
}

export function LoopBodyEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <LoopBodyEditorInner {...props} />
    </ReactFlowProvider>
  );
}