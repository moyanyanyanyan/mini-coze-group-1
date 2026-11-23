import type { Node, Edge } from '@xyflow/react';
import { PropertyPanel } from '@minicoze/ui/workflow-editor';
import type { NodeData, ConditionNodeData, EndNodeData, LoopNodeData } from '../types/workflow';
import { getUpstreamFields, type LoopContext } from '../utils/upstream';
import { ConditionPanelController } from './ConditionPanelController';

interface Props {
  node: Node | null;
  nodes: Node[];
  edges: Edge[];
  loopContext?: LoopContext;
  onChange: (id: string, data: NodeData) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
  onEditLoopBody?: (id: string) => void;
}

export function PropertyPanelController({ node, nodes, edges, loopContext, ...actions }: Props) {
  const upstream = node ? getUpstreamFields(nodes, edges, node.id, loopContext) : [];
  const outputCandidates = node?.type === 'end'
    ? ((node.data as unknown as EndNodeData).outputs || []).map(output =>
      getUpstreamFields(nodes, edges, node.id).filter(field => field.type === output.type))
    : [];
  const bodyCandidates = node?.type === 'loop'
    ? ((node.data as unknown as LoopNodeData).body?.nodes || []).flatMap(bodyNode => {
      if (bodyNode.type === 'llm') return [{ ref: `${bodyNode.id}.text` }];
      if (bodyNode.type === 'condition') return [{ ref: `${bodyNode.id}.branch` }];
      return [];
    }) : [];
  return <PropertyPanel node={node} upstream={upstream} outputCandidates={outputCandidates}
    bodyCandidates={bodyCandidates} {...actions}
    conditionPanel={node?.type === 'condition' && <ConditionPanelController
      data={node.data as unknown as ConditionNodeData} upstream={upstream}
      onChange={data => actions.onChange(node.id, data)}
    />}
  />;
}
