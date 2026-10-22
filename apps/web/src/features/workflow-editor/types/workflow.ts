// src/features/workflow-editor/types/workflow.ts

export type NodeType = 'start' | 'llm' | 'end';

export interface StartInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface StartNodeData {
  label?: string;
  inputs: StartInput[];
}

export interface LlmNodeData {
  label?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  userPromptTemplate: string;
  outputs?: Array<{ name: 'text'; type: 'string' }>;
}

export interface EndOutput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  valueFrom: string;
}

export interface EndNodeData {
  label?: string;
  outputs: EndOutput[];
}

export type NodeData = StartNodeData | LlmNodeData | EndNodeData;

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

export interface NodeResult {
  nodeId: string;
  type: NodeType;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  input?: unknown;
  output?: unknown;
  error?: { code: string; message: string } | null;
  durationMs?: number;
}

export interface WorkflowRunResult {
  runId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  output: Record<string, unknown> | null;
  nodeResults: NodeResult[];
  error: { code: string; message: string; nodeId?: string } | null;
}