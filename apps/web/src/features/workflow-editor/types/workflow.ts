// src/features/workflow-editor/types/workflow.ts

export type NodeType = 'start' | 'llm' | 'end' | 'condition' | 'loop';

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array<string>'
  | 'array<number>'
  | 'array<boolean>';

// ---------- Start ----------
export interface StartInput {
  name: string;
  type: FieldType;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface StartNodeData {
  label?: string;
  inputs: StartInput[];
}

// ---------- LLM ----------
export interface LlmNodeData {
  label?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  userPromptTemplate: string;
  outputs?: Array<{ name: 'text'; type: 'string' }>;
}

// ---------- End ----------
export interface EndOutput {
  name: string;
  type: FieldType;
  valueFrom: string[];
}

export interface EndNodeData {
  label?: string;
  outputs: EndOutput[];
}

// ---------- Condition ----------
export type ConditionLogic = 'and' | 'or';

export type ConditionOperator =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'not_contains'
  | 'empty'
  | 'not_empty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type ConditionRight =
  | { type: 'literal'; value: string | number | boolean }
  | { type: 'ref'; value: string };

export interface ConditionItem {
  left: string;
  op: ConditionOperator;
  right?: ConditionRight;
}

export interface ConditionBranch {
  id: string;
  logic: ConditionLogic;
  conditions: ConditionItem[];
}

export interface ConditionNodeData {
  label?: string;
  branches: ConditionBranch[];
}

// ---------- Loop ----------
export interface LoopBody {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type LoopMode = 'array' | 'count';

export interface LoopOutput {
  name: string;
  type: FieldType;
  valueFrom: string[];
}

export interface LoopNodeData {
  label?: string;
  mode: LoopMode;
  items?: string;
  count?: number | null;
  body: LoopBody;
  outputs: LoopOutput[];
}

// ---------- 节点 / 边 ----------
export type NodeData =
  | StartNodeData
  | LlmNodeData
  | EndNodeData
  | ConditionNodeData
  | LoopNodeData;

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  version: '1.0';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ---------- Workflow 列表项（←←← 之前漏了） ----------
export interface Workflow {
  id: string;
  workspaceId: string;
  creatorId: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  draftDefinition: WorkflowDefinition | null;
  currentVersionId: string | null;
  nodeCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ---------- 运行时 ----------
export interface NodeResult {
  nodeId: string;
  type: NodeType;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  input?: unknown;
  output?: unknown;
  error?: { code: string; message: string } | null;
  durationMs?: number;
  parentId?: string;
  iteration?: number;
}

export interface WorkflowRunResult {
  runId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  output: Record<string, unknown> | null;
  nodeResults: NodeResult[];
  error: { code: string; message: string; nodeId?: string } | null;
}