// Workflow HTTP contract, mirrors docs/workflows/README.md.

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type WorkflowScalarType = 'string' | 'number' | 'boolean';
export type WorkflowArrayType = `array<${WorkflowScalarType}>`;
export type WorkflowFieldType = WorkflowScalarType | WorkflowArrayType;
export type WorkflowNodeType = 'start' | 'llm' | 'end' | 'condition' | 'loop';

/** `nodeId.field`, no braces; a list means "first executed candidate wins". */
export type WorkflowValueFrom = string | string[];

export interface WorkflowStartInput {
  name: string;
  type: WorkflowFieldType;
  required: boolean;
  defaultValue?: unknown;
}

export interface WorkflowEndOutput {
  name: string;
  type: WorkflowFieldType;
  valueFrom: WorkflowValueFrom;
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

export type WorkflowConditionOperator =
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

export interface WorkflowCondition {
  /** `nodeId.field`; its type decides the allowed operators. */
  left: string;
  op: WorkflowConditionOperator;
  /** Omitted for empty / not_empty. */
  right?:
    | { type: 'literal'; value: string | number | boolean }
    | { type: 'ref'; value: string };
}

export interface WorkflowConditionBranch {
  /** Identifier, unique in the node, not `else`; equals the edge sourceHandle. */
  id: string;
  logic?: 'and' | 'or';
  conditions: WorkflowCondition[];
}

/** Output `{ branch }`; exits are every branch id plus the implicit `else`. */
export interface WorkflowConditionData {
  branches: WorkflowConditionBranch[];
  [uiField: string]: unknown;
}

export interface WorkflowLoopOutput {
  name: string;
  type: WorkflowArrayType;
  /** References body nodes; one element per iteration, null if not executed. */
  valueFrom: WorkflowValueFrom;
}

/** Body may reference `<loopId>.item` (array mode) and `<loopId>.index`. */
export interface WorkflowLoopData {
  mode: 'array' | 'count';
  /** Array mode: `nodeId.field` of an array type. */
  items?: string;
  /** Count mode: 1-50. */
  count?: number;
  body: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  outputs?: WorkflowLoopOutput[];
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
  | WorkflowNodeBase<'end', WorkflowEndData>
  | WorkflowNodeBase<'condition', WorkflowConditionData>
  | WorkflowNodeBase<'loop', WorkflowLoopData>;

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
  input: Record<
    string,
    string | number | boolean | string[] | number[] | boolean[]
  >;
}

/** SKIPPED: not executed (untaken branch, or after a failure). */
export type WorkflowNodeRunStatus = 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface WorkflowNodeResult {
  nodeId: string;
  type: WorkflowNodeType;
  status: WorkflowNodeRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  /**
   * LLM_TIMEOUT | LLM_UNAVAILABLE | NODE_EXECUTION_FAILED | REFERENCE_NOT_EXECUTED
   * | WORKFLOW_STEP_LIMIT_EXCEEDED | WORKFLOW_TIMEOUT
   */
  error: WorkflowError | null;
  durationMs: number;
  /** Set on loop body records: the loop node id and 0-based iteration. */
  parentId?: string;
  iteration?: number;
}

export interface WorkflowRunResult {
  runId: string;
  status: 'SUCCEEDED' | 'FAILED';
  output: Record<string, unknown> | null;
  nodeResults: WorkflowNodeResult[];
  /** NODE_EXECUTION_FAILED (with nodeId) | WORKFLOW_SERVICE_UNAVAILABLE | WORKFLOW_INVALID */
  error: WorkflowError | null;
}

export interface WorkflowRunListQuery {
  page?: number;
  /** 1-50, default 10. */
  size?: number;
}

/** Item of GET /workflows/:id/runs; RUNNING means unfinished or interrupted. */
export interface WorkflowRunRecord {
  runId: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  nodeResults: WorkflowNodeResult[];
  error: WorkflowError | null;
  startedAt: string;
  endedAt: string | null;
}

export interface WorkflowRunListResponse {
  items: WorkflowRunRecord[];
  total: number;
  page: number;
  size: number;
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
