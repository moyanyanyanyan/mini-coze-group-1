export interface KnowledgeBase {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: 'TEXT' | 'TXT' | 'JSON';
  originalFileName: string | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  stage: 'VALIDATING' | 'EXTRACTING' | 'CHUNKING' | 'EMBEDDING' | 'PERSISTING' | 'COMPLETED' | 'FAILED';
  chunkCount: number;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunkPreview {
  id: string;
  position: number;
  content: string;
  startOffset: number;
  endOffset: number;
  enabled: boolean;
}

export interface KnowledgeChunkPage {
  items: KnowledgeChunkPreview[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KnowledgeSearchHit {
  chunkId: string;
  knowledgeBaseId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
}

export interface KnowledgeSearchResult {
  status: 'HIT' | 'NO_HIT';
  hits: KnowledgeSearchHit[];
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function getKnowledgeWorkspaceId(): Promise<string> {
  const response = await fetch(`${apiBase}/auth/me`, { credentials: 'include' });
  if (response.ok) {
    const user = await response.json() as { id: string };
    return user.id;
  }
  if (import.meta.env.DEV && response.status === 401) return 'ws-local-demo';
  throw new Error('请先登录后使用知识库');
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiEnvelope<T> | { message?: string | string[] };
  if (!response.ok || !('code' in body) || body.code !== response.status) {
    const message = body.message;
    throw new Error(Array.isArray(message) ? message.join('；') : message || '请求失败');
  }
  return body.data;
}

export async function listKnowledgeDocuments(knowledgeBaseId: string, workspaceId: string): Promise<KnowledgeDocument[]> {
  const params = new URLSearchParams({ workspaceId });
  const response = await fetch(`${apiBase}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents?${params}`, { credentials: 'include' });
  return readResponse<KnowledgeDocument[]>(response);
}

export async function createTextDocument(knowledgeBaseId: string, input: { workspaceId: string; title: string; text: string }): Promise<KnowledgeDocument> {
  const response = await fetch(`${apiBase}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/text`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  return readResponse<KnowledgeDocument>(response);
}

export async function uploadDocumentFile(knowledgeBaseId: string, input: { workspaceId: string; title: string; file: File }): Promise<KnowledgeDocument> {
  const form = new FormData();
  form.append('workspaceId', input.workspaceId);
  if (input.title.trim()) form.append('title', input.title.trim());
  form.append('file', input.file);
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(`${apiBase}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/files?${params}`, {
    method: 'POST', credentials: 'include', body: form,
  });
  return readResponse<KnowledgeDocument>(response);
}

export async function retryKnowledgeDocument(documentId: string, workspaceId: string): Promise<KnowledgeDocument> {
  const response = await fetch(`${apiBase}/documents/${encodeURIComponent(documentId)}/retry`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }),
  });
  return readResponse<KnowledgeDocument>(response);
}

export async function deleteKnowledgeDocument(documentId: string, workspaceId: string): Promise<void> {
  const params = new URLSearchParams({ workspaceId });
  const response = await fetch(`${apiBase}/documents/${encodeURIComponent(documentId)}?${params}`, { method: 'DELETE', credentials: 'include' });
  await readResponse<{ id: string }>(response);
}

export async function listDocumentChunks(knowledgeBaseId: string, documentId: string, workspaceId: string, page: number): Promise<KnowledgeChunkPage> {
  const params = new URLSearchParams({ workspaceId, page: String(page) });
  const response = await fetch(`${apiBase}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/${encodeURIComponent(documentId)}/chunks?${params}`, { credentials: 'include' });
  return readResponse<KnowledgeChunkPage>(response);
}

export async function previewKnowledgeSearch(knowledgeBaseId: string, workspaceId: string, query: string): Promise<KnowledgeSearchResult> {
  const response = await fetch(`${apiBase}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/retrieval-preview`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, query }),
  });
  return readResponse<KnowledgeSearchResult>(response);
}

export async function listKnowledgeBases(workspaceId: string): Promise<KnowledgeBase[]> {
  const params = new URLSearchParams({ workspaceId });
  const response = await fetch(`${apiBase}/knowledge-bases?${params}`, { credentials: 'include' });
  return readResponse<KnowledgeBase[]>(response);
}

export async function createKnowledgeBase(input: {
  workspaceId: string;
  name: string;
  description: string;
}): Promise<KnowledgeBase> {
  const response = await fetch(`${apiBase}/knowledge-bases`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<KnowledgeBase>(response);
}

export async function updateKnowledgeBaseStatus(knowledgeBaseId: string, workspaceId: string, status: 'ACTIVE' | 'DISABLED'): Promise<KnowledgeBase> {
  const response = await fetch(`${apiBase}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/status`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, status }),
  });
  return readResponse<KnowledgeBase>(response);
}

export async function deleteKnowledgeBase(knowledgeBaseId: string, workspaceId: string): Promise<void> {
  const params = new URLSearchParams({ workspaceId });
  const response = await fetch(`${apiBase}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}?${params}`, { method: 'DELETE', credentials: 'include' });
  await readResponse<{ id: string }>(response);
}
