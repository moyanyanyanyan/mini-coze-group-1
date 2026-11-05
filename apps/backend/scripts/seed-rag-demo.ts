import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspaceId = 'ws-local-demo';
const hitBaseName = 'RAG联调-命中库-20261023';
const emptyBaseName = 'RAG联调-空库-20261023';
const documentTitle = '合成餐费报销规则';
const question = '工作日午餐报销上限是多少？';
const fact = '工作日午餐报销上限为每人每天 40 元';
const baseUrl = new URL(process.env.KNOWLEDGE_API_BASE_URL ?? 'http://localhost:3000/api');

if (baseUrl.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(baseUrl.hostname) || baseUrl.pathname.replace(/\/$/, '') !== '/api') {
  throw new Error('仅允许连接本机 http://localhost:<端口>/api 或 http://127.0.0.1:<端口>/api');
}

interface KnowledgeBase { id: string; name: string; status: string }
interface Document { id: string; title: string; status: string; chunkCount: number; error: { code: string; message: string } | null }
interface ChunkPage { items: Array<{ content: string }>; total: number }
interface SearchResult { status: 'HIT' | 'NO_HIT'; hits: Array<{ content: string; score: number }> }

async function request<T>(path: string, options?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const url = new URL(`api/${path.replace(/^\//, '')}`, baseUrl.origin);
  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    headers: options?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options?.timeoutMs ?? 15_000),
  });
  const envelope = await response.json() as { code?: number; message?: string | string[]; data?: T };
  if (!response.ok || envelope.code !== response.status || envelope.data === undefined || envelope.data === null) {
    const message = Array.isArray(envelope.message) ? envelope.message.join('；') : envelope.message;
    throw new Error(`${response.status} ${message ?? '接口响应无效'}`);
  }
  return envelope.data;
}

async function ensureBase(name: string, description: string): Promise<KnowledgeBase> {
  const bases = await request<KnowledgeBase[]>(`knowledge-bases?workspaceId=${workspaceId}`);
  const matches = bases.filter((base) => base.name === name);
  if (matches.length > 1) throw new Error(`发现多个同名知识库「${name}」，请手动处理后重试`);
  const base = matches[0] ?? await request<KnowledgeBase>('knowledge-bases', {
    method: 'POST', body: { workspaceId, name, description },
  });
  if (base.status !== 'ACTIVE') throw new Error(`知识库「${name}」不是 ACTIVE`);
  return base;
}

async function waitReady(documentId: string): Promise<Document> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const document = await request<Document>(`documents/${documentId}?workspaceId=${workspaceId}`);
    if (document.status === 'READY') return document;
    if (document.status === 'FAILED') throw new Error(`文档处理失败：${document.error?.code ?? 'UNKNOWN'} ${document.error?.message ?? ''}`);
    await new Promise((done) => setTimeout(done, 3_000));
  }
  throw new Error(`等待文档 ${documentId} READY 超时，请检查后端和 Embedding 服务`);
}

async function main() {
  const text = (await readFile(resolve(__dirname, '../../../docs/fixtures/rag-reimbursement-sample.txt'), 'utf8')).trim();
  if (!text.includes(fact)) throw new Error('样例文本缺少预期事实，请同步更新脚本中的验证条件');

  const hitBase = await ensureBase(hitBaseName, '本地 RAG HIT 联调样例；内容为合成数据');
  const emptyBase = await ensureBase(emptyBaseName, '本地确定性 NO_HIT 联调样例；保持无文档');
  const emptyDocuments = await request<Document[]>(`knowledge-bases/${emptyBase.id}/documents?workspaceId=${workspaceId}`);
  if (emptyDocuments.length !== 0) throw new Error(`空库 ${emptyBase.id} 已有文档，不能用来验证确定性 NO_HIT`);

  const documents = await request<Document[]>(`knowledge-bases/${hitBase.id}/documents?workspaceId=${workspaceId}`);
  const matches = documents.filter((document) => document.title === documentTitle);
  if (documents.length > 1 || matches.length !== documents.length) {
    throw new Error(`命中库 ${hitBase.id} 含其他或重复文档，请手动检查，脚本不会覆盖现有资料`);
  }
  const submitted = matches[0] ?? await request<Document>(`knowledge-bases/${hitBase.id}/documents/text`, {
    method: 'POST', body: { workspaceId, title: documentTitle, text },
  });
  const document = await waitReady(submitted.id);
  if (document.chunkCount < 1) throw new Error('READY 文档没有切片');
  const chunks = await request<ChunkPage>(`knowledge-bases/${hitBase.id}/documents/${document.id}/chunks?workspaceId=${workspaceId}&page=1`);
  if (chunks.total !== document.chunkCount || !chunks.items.some((chunk) => chunk.content.includes(fact))) {
    throw new Error(`同名文档 ${document.id} 的切片与样例文本不符`);
  }

  const hit = await request<SearchResult>(`knowledge-bases/${hitBase.id}/retrieval-preview`, {
    method: 'POST', body: { workspaceId, query: question }, timeoutMs: 130_000,
  });
  if (hit.status !== 'HIT' || !hit.hits.some((item) => item.content.includes('40 元'))) {
    throw new Error(`命中库预期 HIT，实际为 ${hit.status}`);
  }
  const noHit = await request<SearchResult>(`knowledge-bases/${emptyBase.id}/retrieval-preview`, {
    method: 'POST', body: { workspaceId, query: question }, timeoutMs: 130_000,
  });
  if (noHit.status !== 'NO_HIT' || noHit.hits.length !== 0) throw new Error(`空库预期 NO_HIT，实际为 ${noHit.status}`);

  console.log(JSON.stringify({ workspaceId, hitBaseId: hitBase.id, emptyBaseId: emptyBase.id,
    documentId: document.id, chunkCount: document.chunkCount, question,
    hit: { status: hit.status, count: hit.hits.length }, noHit: { status: noHit.status, count: noHit.hits.length } }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
