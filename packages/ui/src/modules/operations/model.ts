export type RunStatus = 'success' | 'warning' | 'failed';
export type TaskStatus = 'ready' | 'processing' | 'failed';
export interface OperationAgent {
  id: string;
  name: string;
  description: string;
}
export interface OperationBase {
  id: string;
  name: string;
  description: string;
}
export interface OperationChunk {
  id: string;
  position: number;
  content: string;
  start: number;
  end: number;
}
export interface OperationDocument {
  id: string;
  baseId: string;
  name: string;
  sourceBytes: number;
  chunks: OperationChunk[];
}
export interface OperationStage {
  name: string;
  status: 'success' | 'failed' | 'pending' | 'running';
  durationMs: number;
  description: string;
}
export interface OperationTask {
  id: string;
  documentId: string;
  startedAt: number;
  status: TaskStatus;
  attempt: number;
  stages: OperationStage[];
  uploadMs: number;
  processingMs: number;
  error?: string;
  snapshot?: {
    sourceBytesBefore: number;
    sourceBytes: number;
    chunkBytes: number;
    chunkCount: number;
  };
}
export interface OperationRetrieval {
  baseId: string;
  query: string;
  durationMs: number;
  status: 'hit' | 'no_hit' | 'failed';
  hits: { documentId: string; chunkId: string; score: number; used: boolean }[];
}
export interface OperationPlugin {
  name: string;
  tool: string;
  durationMs: number;
  failed: boolean;
  input: Record<string, string>;
  output: Record<string, string>;
}
export interface OperationRun {
  id: string;
  conversationId: string;
  startedAt: number;
  status: RunStatus;
  question: string;
  answer: string;
  durationMs: number;
  firstTokenMs: number | null;
  inputTokens: number;
  outputTokens: number;
  retrievals: OperationRetrieval[];
  plugin?: OperationPlugin;
  stages: OperationStage[];
}
export interface OperationConversation {
  id: string;
  agentId: string;
  title: string;
  source: '平台聊天' | 'SDK/API';
  actor: string;
}
export interface OperationsData {
  agents: OperationAgent[];
  bases: OperationBase[];
  documents: OperationDocument[];
  tasks: OperationTask[];
  conversations: OperationConversation[];
  runs: OperationRun[];
  snapshotAt: number;
}
export type OperationsRoute =
  | { page: 'overview' | 'agents' | 'knowledge' }
  | { page: 'conversations'; agentId: string }
  | { page: 'conversation'; agentId: string; conversationId: string }
  | { page: 'base'; baseId: string }
  | { page: 'document'; baseId: string; taskId: string }
  | { page: 'not-found' };
export const operationsRoot = '/workspace/operations';
export const agentPath = (id: string) => `${operationsRoot}/agents/${encodeURIComponent(id)}`;
export const conversationPath = (agentId: string, id: string) =>
  `${agentPath(agentId)}/conversations/${encodeURIComponent(id)}`;
export const basePath = (id: string) => `${operationsRoot}/knowledge/${encodeURIComponent(id)}`;
export const taskPath = (baseId: string, id: string) =>
  `${basePath(baseId)}/documents/${encodeURIComponent(id)}`;

export function parseOperationsRoute(pathname: string): OperationsRoute {
  const parts = pathname.slice(operationsRoot.length).split('/').filter(Boolean);
  if (!pathname.startsWith(operationsRoot)) return { page: 'not-found' };
  if (!parts.length) return { page: 'overview' };
  if (parts[0] === 'agents') {
    if (parts.length === 1) return { page: 'agents' };
    if (parts.length === 2) return { page: 'conversations', agentId: parts[1] };
    if (parts.length === 4 && parts[2] === 'conversations')
      return { page: 'conversation', agentId: parts[1], conversationId: parts[3] };
  }
  if (parts[0] === 'knowledge') {
    if (parts.length === 1) return { page: 'knowledge' };
    if (parts.length === 2) return { page: 'base', baseId: parts[1] };
    if (parts.length === 4 && parts[2] === 'documents')
      return { page: 'document', baseId: parts[1], taskId: parts[3] };
  }
  return { page: 'not-found' };
}

export const byteLength = (text: string) => new TextEncoder().encode(text).length;
export const chunkBytes = (chunks: OperationChunk[]) =>
  chunks.reduce((n, c) => n + byteLength(c.content), 0);
export const duration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`);
export const bytes = (n: number) =>
  n < 1000
    ? `${n} B`
    : n < 1_000_000
      ? `${(n / 1000).toFixed(1)} KB`
      : `${(n / 1_000_000).toFixed(2)} MB`;
export const time = (at: number) => new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
export const dateTime = (at: number) => new Date(at).toLocaleString('zh-CN', { hour12: false });
export const withinDays = (at: number, days: number, now: number) =>
  at <= now && at >= now - days * 86400_000;
export function runSummary(runs: OperationRun[]) {
  const failed = runs.filter((r) => r.status === 'failed').length;
  return {
    count: runs.length,
    failed,
    warnings: runs.filter((r) => r.status === 'warning').length,
    rate: runs.length ? `${(((runs.length - failed) / runs.length) * 100).toFixed(1)}%` : '—',
    average: runs.length
      ? duration(Math.round(runs.reduce((n, r) => n + r.durationMs, 0) / runs.length))
      : '—',
  };
}
export function latestTask(data: OperationsData, documentId: string) {
  return data.tasks
    .filter((t) => t.documentId === documentId)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}
export function baseSummary(data: OperationsData, baseId: string) {
  const docs = data.documents.filter((d) => d.baseId === baseId);
  const ready = docs.filter((d) => latestTask(data, d.id)?.status === 'ready');
  return {
    files: docs.length,
    sourceBytes: docs.reduce((n, d) => n + d.sourceBytes, 0),
    chunkCount: ready.reduce((n, d) => n + d.chunks.length, 0),
    chunkBytes: ready.reduce((n, d) => n + chunkBytes(d.chunks), 0),
    processing: docs.filter((d) => latestTask(data, d.id)?.status === 'processing').length,
    failed: docs.filter((d) => latestTask(data, d.id)?.status === 'failed').length,
  };
}
export const matchesText = (text: string, query: string) =>
  text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
