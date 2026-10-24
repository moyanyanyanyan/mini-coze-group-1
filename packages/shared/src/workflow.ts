// Workflow HTTP contract, mirrors docs/workflows/README.md.

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type WorkflowFieldType = 'string' | 'number' | 'boolean';
export type WorkflowNodeType = 'start' | 'llm' | 'end';

export interface WorkflowStartInput {
  name: string;
  type: WorkflowFieldType;
  required: boolean;
  defaultValue?: unknown;
}

export interface WorkflowEndOutput {
  name: string;
  type: WorkflowFieldType;
  /** `nodeId.field`, no braces. */
  valueFrom: string;
}

export interface WorkflowStartData {
  inputs: WorkflowStartInput[];
  [uiField: string]: unknown;
}

export interface WorkflowLlmData {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Supports `{{nodeId.field}}`. */
  userPromptTemplate: string;
  outputs?: [{ name: 'text'; type: 'string' }];
  [uiField: string]: unknown;
}

export interface WorkflowEndData {
  outputs: WorkflowEndOutput[];
  [uiField: string]: unknown;
}

interface WorkflowNodeBase<T extends WorkflowNodeType, D> {
  id: string;
  type: T;
  position: { x: number; y: number };
  data: D;
  [uiField: string]: unknown;
}

export type WorkflowNode =
  | WorkflowNodeBase<'start', WorkflowStartData>
  | WorkflowNodeBase<'llm', WorkflowLlmData>
  | WorkflowNodeBase<'end', WorkflowEndData>;

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [uiField: string]: unknown;
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
  description: string | null;
  status: WorkflowStatus;
  /** null for a newly created workflow; the editor supplies a default template. */
  draftDefinition: WorkflowDefinition | null;
  currentVersionId: null;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowListItem = Omit<Workflow, 'draftDefinition'> & {
  nodeCount: number;
};

export interface WorkflowListQuery {
  page?: number;
  /** 1-50, default 10. */
  size?: number;
  keyword?: string;
  status?: WorkflowStatus;
}

export interface WorkflowListResponse {
  items: WorkflowListItem[];
  total: number;
  page: number;
  size: number;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  workspaceId?: string;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
}

export interface SaveDraftRequest {
  definition: WorkflowDefinition;
}

export interface WorkflowMutationResponse {
  id: string;
  updatedAt: string;
}

export interface WorkflowError {
  code: string;
  message: string;
  nodeId?: string | null;
  edgeId?: string | null;
  field?: string;
}

export interface ValidateWorkflowRequest {
  definition?: WorkflowDefinition;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowError[];
}

export interface RunWorkflowRequest {
  input: Record<string, string | number | boolean>;
}

export type WorkflowNodeRunStatus = 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface WorkflowNodeResult {
  nodeId: string;
  type: WorkflowNodeType;
  status: WorkflowNodeRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  /** LLM_TIMEOUT | LLM_UNAVAILABLE | NODE_EXECUTION_FAILED */
  error: WorkflowError | null;
  durationMs: number;
}

export interface WorkflowRunResult {
  runId: string;
  status: 'SUCCEEDED' | 'FAILED';
  output: Record<string, unknown> | null;
  nodeResults: WorkflowNodeResult[];
  /** NODE_EXECUTION_FAILED (with nodeId) | WORKFLOW_SERVICE_UNAVAILABLE | WORKFLOW_INVALID */
  error: WorkflowError | null;
}

/** Body of every non-2xx response (global HttpExceptionFilter). */
export interface ApiErrorResponse {
  statusCode: number;
  /** e.g. WORKFLOW_NOT_FOUND, INVALID_INPUT, WORKFLOW_INVALID; DTO errors are string[]. */
  message: string | string[];
  path: string;
  timestamp: string;
  details?: WorkflowError[];
}
