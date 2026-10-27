// src/features/workflow-editor/services/workflow.ts

import type {
  Workflow,
  WorkflowDefinition,
  WorkflowRunResult,
} from '../types/workflow';

const USE_MOCK = false;
const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
const BASE = env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// ---------- Mock 数据 ----------
const mockWorkflows: Workflow[] = [
  {
    id: 'wf_mock_001',
    workspaceId: 'ws_mock',
    creatorId: 'user_mock',
    name: '示例工作流',
    description: 'Mock 数据，用于 Week 2 自测',
    status: 'DRAFT',
    draftDefinition: null,
    currentVersionId: null,
    nodeCount: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockDefinition: WorkflowDefinition = {
  version: '1.0',
  nodes: [
    {
      id: 'node-start-1',
      type: 'start',
      position: { x: 80, y: 160 },
      data: {
        label: '开始',
        inputs: [
          { name: 'query', type: 'string', required: true, description: '用户输入' },
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

// ---------- 通用请求 ----------
async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // 优先用 details[0].message，再退 message
    const detailMsg =
      Array.isArray(err.details) && err.details[0]?.message
        ? err.details[0].message
        : null;
    const msg =
      detailMsg ||
      (Array.isArray(err.message) ? err.message[0] : err.message) ||
      `请求失败: ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------- 列表 ----------
export async function listWorkflows(params?: {
  page?: number;
  size?: number;
  keyword?: string;
}): Promise<{ items: Workflow[]; total: number; page: number; size: number }> {
  if (USE_MOCK) {
    let items = [...mockWorkflows];
    if (params?.keyword) {
      items = items.filter((w) => w.name.includes(params.keyword!));
    }
    return { items, total: items.length, page: 1, size: 10 };
  }
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.size) qs.set('size', String(params.size));
  if (params?.keyword) qs.set('keyword', params.keyword);
  return http(`/workflows?${qs}`);
}

// ---------- 创建 ----------
export async function createWorkflow(body: {
  workspaceId?: string;
  name: string;
  description?: string;
}): Promise<Workflow> {
  if (USE_MOCK) {
    const wf: Workflow = {
      id: `wf_mock_${Date.now()}`,
      workspaceId: body.workspaceId || 'ws_mock',
      creatorId: 'user_mock',
      name: body.name,
      description: body.description,
      status: 'DRAFT',
      draftDefinition: null,
      currentVersionId: null,
      nodeCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockWorkflows.unshift(wf);
    return wf;
  }
  return http('/workflows', { method: 'POST', body: JSON.stringify(body) });
}

// ---------- 详情 ----------
export async function getWorkflow(id: string): Promise<Workflow> {
  if (USE_MOCK) {
    const wf = mockWorkflows.find((x) => x.id === id);
    if (!wf) throw new Error('工作流不存在');
    if (!wf.draftDefinition) {
      return { ...wf, draftDefinition: mockDefinition };
    }
    return wf;
  }
  return http(`/workflows/${id}`);
}

// ---------- 保存草稿 ----------
export async function saveDraft(
  id: string,
  definition: WorkflowDefinition,
): Promise<{ id: string; updatedAt: string }> {
  if (USE_MOCK) {
    const wf = mockWorkflows.find((x) => x.id === id);
    if (wf) {
      wf.draftDefinition = definition;
      wf.nodeCount = definition.nodes.length;
      wf.updatedAt = new Date().toISOString();
    }
    return { id, updatedAt: new Date().toISOString() };
  }
  return http(`/workflows/${id}/draft`, {
    method: 'PUT',
    body: JSON.stringify({ definition }),
  });
}

// ---------- 校验 ----------
export async function validateWorkflow(
  id: string,
  definition: WorkflowDefinition,
): Promise<{
  valid: boolean;
  errors: Array<{
    code: string;
    message: string;
    nodeId?: string | null;
    edgeId?: string | null;
    field?: string | null;
  }>;
}> {
  if (USE_MOCK) {
    const errors: Array<{
      code: string;
      message: string;
      nodeId?: string | null;
    }> = [];
    const starts = definition.nodes.filter((n) => n.type === 'start');
    const ends = definition.nodes.filter((n) => n.type === 'end');
    if (starts.length !== 1) {
      errors.push({
        code: 'START_COUNT_INVALID',
        message: '必须有且仅有一个 Start 节点',
      });
    }
    if (ends.length !== 1) {
      errors.push({
        code: 'END_COUNT_INVALID',
        message: '必须有且仅有一个 End 节点',
      });
    }
    return { valid: errors.length === 0, errors };
  }
  return http(`/workflows/${id}/validate`, {
    method: 'POST',
    body: JSON.stringify({ definition }),
  });
}

// ---------- 运行 ----------
export async function runWorkflow(
  id: string,
  input: Record<string, unknown>,
): Promise<WorkflowRunResult> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 1500));
    return {
      runId: `run_mock_${Date.now()}`,
      status: 'SUCCEEDED',
      output: { result: '这是 Mock 运行结果' },
      nodeResults: [
        {
          nodeId: 'node-start-1',
          type: 'start',
          status: 'SUCCEEDED',
          input,
          output: input,
          error: null,
          durationMs: 2,
        },
        {
          nodeId: 'node-llm-1',
          type: 'llm',
          status: 'SUCCEEDED',
          input,
          output: { text: '这是 Mock 运行结果' },
          error: null,
          durationMs: 1500,
        },
        {
          nodeId: 'node-end-1',
          type: 'end',
          status: 'SUCCEEDED',
          input: {},
          output: { result: '这是 Mock 运行结果' },
          error: null,
          durationMs: 1,
        },
      ],
      error: null,
    };
  }
  return http(`/workflows/${id}/run`, {
    method: 'POST',
    body: JSON.stringify({ input }),
  });
}

// ---------- 删除 ----------
export async function deleteWorkflow(id: string): Promise<void> {
  if (USE_MOCK) {
    const i = mockWorkflows.findIndex((x) => x.id === id);
    if (i >= 0) mockWorkflows.splice(i, 1);
    return;
  }
  return http(`/workflows/${id}`, { method: 'DELETE' });
}