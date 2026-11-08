// src/features/workflow-editor/utils/upstream.ts
import type { Node, Edge } from '@xyflow/react';
import type {
  StartNodeData,
  LlmNodeData,
  LoopNodeData,
} from '../types/workflow';

export interface UpstreamField {
  ref: string;
  nodeId: string;
  field: string;
  nodeLabel: string;
  type: string;
}

export interface LoopContext {
  loopId: string;
  mode: 'array' | 'count';
  externalNodes: Node[];
}

export function getNodeOutputs(node: Pick<Node, 'type' | 'data'>): Array<{ name: string; type: string }> {
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
  if (node.type === 'condition') {
    return [{ name: 'branch', type: 'string' }];
  }
  if (node.type === 'loop') {
    const d = node.data as unknown as LoopNodeData;
    return (d.outputs || []).map((o) => ({ name: o.name, type: o.type }));
  }
  return [];
}

export function getNodeLabel(node: Node): string {
  const d = node.data as { label?: string };
  if (d.label) return d.label;
  return node.type === 'start'
    ? '开始'
    : node.type === 'llm'
    ? 'LLM'
    : node.type === 'condition'
    ? '条件'
    : node.type === 'loop'
    ? '循环'
    : '结束';
}

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

function nodesToFields(nodes: Node[]): UpstreamField[] {
  return nodes.flatMap((n) =>
    getNodeOutputs(n).map((o) => ({
      ref: `${n.id}.${o.name}`,
      nodeId: n.id,
      field: o.name,
      nodeLabel: getNodeLabel(n),
      type: o.type,
    })),
  );
}

export function getUpstreamFields(
  nodes: Node[],
  edges: Edge[],
  currentId: string,
  loopContext?: LoopContext,
): UpstreamField[] {
  const localUpstream = getUpstreamNodes(nodes, edges, currentId);
  const base = nodesToFields(localUpstream);

  if (!loopContext) return base;

  const external = nodesToFields(loopContext.externalNodes);

  const extra: UpstreamField[] = [
    {
      ref: `${loopContext.loopId}.index`,
      nodeId: loopContext.loopId,
      field: 'index',
      nodeLabel: '循环',
      type: 'number',
    },
  ];
  if (loopContext.mode === 'array') {
    extra.unshift({
      ref: `${loopContext.loopId}.item`,
      nodeId: loopContext.loopId,
      field: 'item',
      nodeLabel: '循环',
      type: 'string',
    });
  }
  return [...base, ...external, ...extra];
}
