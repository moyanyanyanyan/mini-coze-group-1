// src/features/workflow-editor/utils/frontend-validate.ts
import type { Node, Edge } from '@xyflow/react';
import type { StartNodeData, LlmNodeData, EndNodeData } from '../types/workflow';
import type { ValidationError } from '../components/ValidationDialog';

export function frontendValidate(
  nodes: Node[],
  edges: Edge[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  const starts = nodes.filter((n) => n.type === 'start');
  const ends = nodes.filter((n) => n.type === 'end');
  const llms = nodes.filter((n) => n.type === 'llm');

  if (starts.length === 0) {
    errors.push({
      code: 'START_COUNT_INVALID',
      message: '必须有且仅有一个 Start 节点',
    });
  } else if (starts.length > 1) {
    errors.push({
      code: 'START_COUNT_INVALID',
      message: `Start 节点数量为 ${starts.length}，只允许 1 个`,
      nodeId: starts[1].id,
    });
  }

  if (ends.length === 0) {
    errors.push({
      code: 'END_COUNT_INVALID',
      message: '必须有且仅有一个 End 节点',
    });
  } else if (ends.length > 1) {
    errors.push({
      code: 'END_COUNT_INVALID',
      message: `End 节点数量为 ${ends.length}，只允许 1 个`,
      nodeId: ends[1].id,
    });
  }

  // Start 节点输入
  starts.forEach((n) => {
    const data = n.data as unknown as StartNodeData;
    if (!data.inputs || data.inputs.length === 0) {
      errors.push({
        code: 'START_INPUT_REQUIRED',
        message: 'Start 节点至少需要 1 个输入参数',
        nodeId: n.id,
        field: 'data.inputs',
      });
    }
  });

  // LLM 节点必填
  llms.forEach((n) => {
    const data = n.data as unknown as LlmNodeData;
    if (!data.model || !data.model.trim()) {
      errors.push({
        code: 'LLM_MODEL_REQUIRED',
        message: 'LLM 节点模型不能为空',
        nodeId: n.id,
        field: 'data.model',
      });
    }
    if (!data.userPromptTemplate || !data.userPromptTemplate.trim()) {
      errors.push({
        code: 'LLM_PROMPT_REQUIRED',
        message: 'LLM 节点 Prompt 模板不能为空',
        nodeId: n.id,
        field: 'data.userPromptTemplate',
      });
    }
  });

  // End 节点输出
  ends.forEach((n) => {
    const data = n.data as unknown as EndNodeData;
    if (!data.outputs || data.outputs.length === 0) {
      errors.push({
        code: 'END_OUTPUT_REQUIRED',
        message: 'End 节点至少需要 1 个输出参数',
        nodeId: n.id,
        field: 'data.outputs',
      });
    }
    (data.outputs || []).forEach((o, idx) => {
      if (!o.valueFrom || !o.valueFrom.trim()) {
        errors.push({
          code: 'INVALID_REFERENCE',
          message: `输出「${o.name}」未指定来源`,
          nodeId: n.id,
          field: `data.outputs[${idx}].valueFrom`,
        });
      }
    });
  });

  // 孤立节点（MVP 简化：每个节点至少有一条连线）
  nodes.forEach((n) => {
    const hasEdge = edges.some(
      (e) => e.source === n.id || e.target === n.id,
    );
    if (!hasEdge && nodes.length > 1) {
      errors.push({
        code: 'ISOLATED_NODE',
        message: `节点「${n.id}」没有连接任何连线`,
        nodeId: n.id,
      });
    }
  });

  return errors;
}