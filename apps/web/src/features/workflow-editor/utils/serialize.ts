// src/features/workflow-editor/utils/serialize.ts
import type { Node, Edge } from '@xyflow/react';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  NodeData,
  NodeType,
} from '../types/workflow';

/**
 * 画布 nodes/edges → WorkflowDefinition
 */
export function canvasToDefinition(
  nodes: Node[],
  edges: Edge[],
): WorkflowDefinition {
  const wfNodes: WorkflowNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.type as NodeType,
    position: { x: n.position.x, y: n.position.y },
    data: n.data as unknown as NodeData,
  }));

  const wfEdges: WorkflowEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
  }));

  return {
    version: '1.0',
    nodes: wfNodes,
    edges: wfEdges,
  };
}

/**
 * 生成默认 Start → LLM → End 模板（新建工作流时用）
 */
export function defaultDefinition(): WorkflowDefinition {
  return {
    version: '1.0',
    nodes: [
      {
        id: 'node-start-1',
        type: 'start',
        position: { x: 80, y: 160 },
        data: {
          label: '开始',
          inputs: [
            {
              name: 'query',
              type: 'string',
              required: true,
              description: '用户输入',
            },
          ],
        },
      },
      {
        id: 'node-llm-1',
        type: 'llm',
        position: { x: 360, y: 160 },
        data: {
          label: 'LLM',
          model: 'deepseek-flash',
          temperature: 0.7,
          maxTokens: 2048,
          systemPrompt: '你是一个助手',
          userPromptTemplate: '{{node-start-1.query}}',
          outputs: [{ name: 'text', type: 'string' }],
        },
      },
      {
        id: 'node-end-1',
        type: 'end',
        position: { x: 640, y: 160 },
        data: {
          label: '结束',
          outputs: [
            { name: 'result', type: 'string', valueFrom: 'node-llm-1.text' },
          ],
        },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'node-start-1', target: 'node-llm-1' },
      { id: 'edge-2', source: 'node-llm-1', target: 'node-end-1' },
    ],
  };
}

/**
 * 下载 JSON 文件
 */
export function downloadDefinition(def: WorkflowDefinition, name: string) {
  const blob = new Blob([JSON.stringify(def, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || 'workflow'}.workflow.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}