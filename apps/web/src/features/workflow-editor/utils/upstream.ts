// src/features/workflow-editor/utils/upstream.ts
import type { Node, Edge } from '@xyflow/react';
import type {
  StartNodeData,
  LlmNodeData,
  EndNodeData,
} from '../types/workflow';

export interface UpstreamField {
  /** 完整引用，如 node-start-1.query */
  ref: string;
  /** 节点 id */
  nodeId: string;
  /** 字段名 */
  field: string;
  /** 展示用：节点标签 */
  nodeLabel: string;
  /** 展示用：字段类型 */
  type: string;
}

/** 节点的固定输出字段名 */
export function getNodeOutputs(node: Node): Array<{ name: string; type: string }> {
  if (node.type === 'start') {
    const d = node.data as unknown as StartNodeData;
    return (d.inputs || []).map((i) => ({ name: i.name, type: i.type }));
  }
  if (node.type === 'llm') {
    const d = node.data as unknown as LlmNodeData;
    return d.outputs && d.outputs.length > 0
      ? d.outputs
      : [{ name: 'text', type: 'string' }];
  }
  // getNodeOutputs 加 condition 分支
  if (node.type === 'condition') {
    return [{ name: 'branch', type: 'string' }];
  }
  if (node.type === 'loop') {
    const d = node.data as unknown as { outputs?: Array<{ name: string; type: string }> };
    return d.outputs || [];
  }
  // end 无输出
  return [];
}

/** 节点的展示名 */
export function getNodeLabel(node: Node): string {
  const d = node.data as { label?: string };
  if (d.label) return d.label;
  return node.type === 'start' ? '开始' : node.type === 'llm' ? 'LLM' : '结束';
}

/** 找出 currentId 的所有上游节点（沿 edges 反向 BFS） */
export function getUpstreamNodes(
  nodes: Node[],
  edges: Edge[],
  currentId: string,
): Node[] {
  const incoming = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  });

  const visited = new Set<string>();
  const queue = [...(incoming.get(currentId) || [])];
  const result: Node[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const n = nodeMap.get(id);
    if (n) result.push(n);
    const parents = incoming.get(id) || [];
    queue.push(...parents);
  }
  return result;
}

/** 收集 currentId 所有可选的上游字段 */
export function getUpstreamFields(
  nodes: Node[],
  edges: Edge[],
  currentId: string,
): UpstreamField[] {
  return getUpstreamNodes(nodes, edges, currentId).flatMap((n) =>
    getNodeOutputs(n).map((o) => ({
      ref: `${n.id}.${o.name}`,
      nodeId: n.id,
      field: o.name,
      nodeLabel: getNodeLabel(n),
      type: o.type,
    })),
  );
}