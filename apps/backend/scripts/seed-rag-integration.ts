/** 通过真实 HTTP 接口准备 RAG 联调用的用户、Agent、绑定和合成知识库。 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const apiUrl = new URL(process.env.RAG_TEST_API_BASE_URL ?? 'http://localhost:3000/api/');
if (apiUrl.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(apiUrl.hostname) ||
    apiUrl.pathname.replace(/\/$/, '') !== '/api' || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
  throw new Error('RAG_TEST_API_BASE_URL 仅允许本机 http://localhost:<端口>/api/');
}
apiUrl.pathname = '/api/';
if (!process.env.RAG_TEST_PASSWORD || process.env.RAG_TEST_PASSWORD.length < 8 || process.env.RAG_TEST_PASSWORD.length > 64) {
  throw new Error('请用 RAG_TEST_PASSWORD 提供 8～64 位的本地测试账号密码；脚本不会打印密码');
}

const email = process.env.RAG_TEST_EMAIL ?? 'rag-integration@example.test';
const password = process.env.RAG_TEST_PASSWORD;
const expectedModel = process.env.RAG_TEST_MODEL?.trim();
const prefix = 'RAG联调-v1';
const mealTitle = '合成餐费报销规则';
const lodgingTitle = '合成住宿报销规则';
const mealFact = '工作日午餐报销上限为每人每天 40 元';
const lodgingFact = '出差住宿报销上限为每间每晚 300 元';

interface ApiResponse<T> { status: number; body: T }
interface AuthResponse { accessToken: string; user: { id: string; email: string } }
interface KnowledgeBase { id: string; workspaceId: string; name: string; status: string }
interface Document { id: string; title: string; sourceType: string; status: string; chunkCount: number; error?: { code: string; message: string } | null }
interface Agent { id: string; name: string; status: string; model: string }
interface AgentPage { items: Agent[]; total: number }
interface Binding { knowledgeBaseId: string; enabled: boolean }
interface ChunkPage { items: Array<{ content: string }>; total: number }
interface SearchResult { status: 'HIT' | 'NO_HIT'; hits: Array<{ content: string }> }

class HttpFailure extends Error {
  constructor(readonly status: number, message: string) { super(`${status} ${message}`); }
}

async function send<T>(path: string, options: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}): Promise<ApiResponse<T>> {
  const isForm = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(new URL(path.replace(/^\/+/, ''), apiUrl), {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : isForm ? options.body as FormData : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    throw new Error(`无法连接本机后端 ${apiUrl.origin} 或请求超时：${error instanceof Error ? error.message : String(error)}`);
  }
  const body = await response.json() as { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new HttpFailure(response.status, message ?? '请求失败');
  }
  return { status: response.status, body: body as T };
}

async function data<T>(path: string, token: string, options: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const response = await send<{ code: number; data: T }>(path, { ...options, token });
  if (response.body.code !== response.status || response.body.data === null || response.body.data === undefined) {
    throw new Error(`${path} 的响应外壳不符合 {code,message,data} 契约`);
  }
  return response.body.data;
}

async function authenticate(): Promise<AuthResponse> {
  try {
    const response = await send<AuthResponse>('auth/register', {
      method: 'POST', body: { email, password, displayName: 'RAG 联调测试用户' },
    });
    if (response.status !== 201) throw new Error(`注册预期 HTTP 201，实际 ${response.status}`);
    return response.body;
  } catch (error) {
    if (!(error instanceof HttpFailure) || error.status !== 409) throw error;
    const response = await send<AuthResponse>('auth/login', { method: 'POST', body: { email, password } });
    return response.body;
  }
}

async function ensureBase(token: string, workspaceId: string, name: string): Promise<KnowledgeBase> {
  const bases = await data<KnowledgeBase[]>(`knowledge-bases?workspaceId=${workspaceId}`, token);
  const matches = bases.filter((base) => base.name === name);
  if (matches.length > 1) throw new Error(`发现多个同名知识库：${name}`);
  const base = matches[0] ?? await data<KnowledgeBase>('knowledge-bases', token, {
    method: 'POST', body: { workspaceId, name, description: '仅用于 MiniCoze RAG 联调的合成数据' },
  });
  if (base.workspaceId !== workspaceId || base.status !== 'ACTIVE') throw new Error(`知识库 ${name} 不属于测试用户或已停用`);
  return base;
}

async function ensureDocument(token: string, workspaceId: string, base: KnowledgeBase, title: string, text: string,
  fact: string, sourceType: 'TEXT' | 'TXT'): Promise<Document> {
  const path = `knowledge-bases/${base.id}/documents`;
  const documents = await data<Document[]>(`${path}?workspaceId=${workspaceId}`, token);
  if (documents.length > 1 || documents.some((document) => document.title !== title)) {
    throw new Error(`知识库 ${base.name} 含其他资料，脚本不会覆盖`);
  }
  let submitted = documents[0];
  if (!submitted) {
    const body = sourceType === 'TXT' ? new FormData() : { workspaceId, title, text };
    if (body instanceof FormData) {
      body.append('workspaceId', workspaceId);
      body.append('title', title);
      body.append('file', new Blob([text], { type: 'text/plain' }), 'rag-lodging-sample.txt');
    }
    submitted = await data<Document>(`${path}/${sourceType === 'TXT' ? 'files' : 'text'}`, token, {
      method: 'POST', body,
    });
  }
  if (submitted.sourceType !== sourceType) throw new Error(`文档 ${title} 来源类型与预期 ${sourceType} 不符`);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const document = await data<Document>(`documents/${submitted.id}?workspaceId=${workspaceId}`, token);
    if (document.status === 'FAILED') throw new Error(`文档 ${title} 处理失败：${document.error?.code ?? 'UNKNOWN'} ${document.error?.message ?? ''}`);
    if (document.status === 'READY') {
      if (document.chunkCount < 1) throw new Error(`文档 ${title} READY 但没有切片`);
      const chunks = await data<ChunkPage>(`${path}/${document.id}/chunks?workspaceId=${workspaceId}&page=1`, token);
      if (chunks.total !== document.chunkCount || !chunks.items.some((chunk) => chunk.content.includes(fact))) {
        throw new Error(`文档 ${title} 的切片与合成资料不符`);
      }
      return document;
    }
    await new Promise((done) => setTimeout(done, 3_000));
  }
  throw new Error(`等待文档 ${title} READY 超时`);
}

async function findAgent(token: string, name: string): Promise<Agent | undefined> {
  const result = await data<AgentPage>('agents', token);
  if (result.total > result.items.length) {
    throw new Error('测试账号的 Agent 超过默认列表页容量；请改用独立测试账号，避免误认重名 Agent');
  }
  const matches = result.items.filter((agent) => agent.name === name);
  if (matches.length > 1) throw new Error(`发现多个同名 Agent：${name}`);
  return matches[0];
}

async function ensureAgent(token: string, name: string, knowledgeBaseIds: string[]): Promise<Agent> {
  const existing = await findAgent(token, name);
  const agent = existing ?? await data<Agent>('agents', token, {
    method: 'POST', body: {
      name, description: '仅用于 MiniCoze RAG 联调',
      systemPrompt: '只依据知识库资料回答；没有依据时说明未找到。',
      ...(expectedModel ? { model: expectedModel } : {}),
    },
  });
  if (agent.status === 'ARCHIVED') throw new Error(`Agent ${name} 已归档`);
  if (expectedModel && agent.model !== expectedModel) {
    throw new Error(`Agent ${name} 使用 ${agent.model}，预期 ${expectedModel}；脚本不会修改已有 Agent`);
  }
  const bindings = await data<Binding[]>(`agents/${agent.id}/knowledge-bases`, token);
  const same = bindings.length === knowledgeBaseIds.length &&
    knowledgeBaseIds.every((id) => bindings.some((binding) => binding.knowledgeBaseId === id && binding.enabled));
  if (!same && bindings.length > 0) throw new Error(`Agent ${name} 已有不同绑定，脚本不会全量替换`);
  if (!same) {
    const saved = await data<Binding[]>(`agents/${agent.id}/knowledge-bases`, token, {
      method: 'PUT', body: { bindings: knowledgeBaseIds.map((knowledgeBaseId) => ({ knowledgeBaseId, enabled: true })) },
    });
    if (saved.length !== knowledgeBaseIds.length) throw new Error(`Agent ${name} 绑定保存数量不符`);
  }
  return agent;
}

async function checkSearch(token: string, workspaceId: string, base: KnowledgeBase, query: string, expected: 'HIT' | 'NO_HIT', fact?: string) {
  const result = await data<SearchResult>(`knowledge-bases/${base.id}/retrieval-preview`, token, {
    method: 'POST', body: { workspaceId, query }, timeoutMs: 130_000,
  });
  if (result.status !== expected || (fact && !result.hits.some((hit) => hit.content.includes(fact))) ||
      (expected === 'NO_HIT' && result.hits.length !== 0)) {
    throw new Error(`知识库 ${base.name} 预期 ${expected}，实际 ${result.status} (${result.hits.length} 条)`);
  }
}

async function main() {
  const auth = await authenticate();
  if (!auth.accessToken || !auth.user?.id) throw new Error('注册/登录响应缺少 accessToken 或 user.id');
  const token = auth.accessToken;
  const actorId = auth.user.id;
  const currentUser = await send<{ id: string }>('auth/me', { token });
  if (currentUser.body.id !== actorId) throw new Error('登录身份与 /auth/me 不一致');

  const mealText = (await readFile(resolve(__dirname, '../../../docs/fixtures/rag-reimbursement-sample.txt'), 'utf8')).trim();
  const lodgingText = (await readFile(resolve(__dirname, '../../../docs/fixtures/rag-lodging-sample.txt'), 'utf8')).trim();
  if (!mealText.includes(mealFact) || !lodgingText.includes(lodgingFact)) throw new Error('合成资料缺少预期事实');

  const meal = await ensureBase(token, actorId, `${prefix}-餐费库`);
  const lodging = await ensureBase(token, actorId, `${prefix}-住宿库`);
  const empty = await ensureBase(token, actorId, `${prefix}-空库`);
  const emptyDocuments = await data<Document[]>(`knowledge-bases/${empty.id}/documents?workspaceId=${actorId}`, token);
  if (emptyDocuments.length) throw new Error(`空库 ${empty.id} 已有资料，无法确定性验证 NO_HIT`);

  const mealDocument = await ensureDocument(token, actorId, meal, mealTitle, mealText, mealFact, 'TEXT');
  const lodgingDocument = await ensureDocument(token, actorId, lodging, lodgingTitle, lodgingText, lodgingFact, 'TXT');
  const singleAgent = await ensureAgent(token, `${prefix}-单库Agent`, [meal.id]);
  const emptyAgent = await ensureAgent(token, `${prefix}-空库Agent`, [empty.id]);
  const multiAgent = await ensureAgent(token, `${prefix}-多库Agent`, [meal.id, lodging.id]);

  await checkSearch(token, actorId, meal, '工作日午餐报销上限是多少？', 'HIT', mealFact);
  await checkSearch(token, actorId, lodging, '出差住宿报销上限是多少？', 'HIT', lodgingFact);
  await checkSearch(token, actorId, empty, '工作日午餐报销上限是多少？', 'NO_HIT');

  process.stdout.write(`${JSON.stringify({
    email: auth.user.email, actorId, workspaceId: actorId,
    knowledgeBases: { meal: meal.id, lodging: lodging.id, empty: empty.id },
    documents: { meal: mealDocument.id, lodging: lodgingDocument.id },
    agents: {
      single: { id: singleAgent.id, model: singleAgent.model, knowledgeBaseIds: [meal.id] },
      empty: { id: emptyAgent.id, model: emptyAgent.model, knowledgeBaseIds: [empty.id] },
      multi: { id: multiAgent.id, model: multiAgent.model, knowledgeBaseIds: [meal.id, lodging.id] },
    },
    questions: { meal: '工作日午餐报销上限是多少？', lodging: '出差住宿报销上限是多少？', multi: '餐费和住宿的报销上限分别是多少？' },
    checks: { meal: 'HIT', lodging: 'HIT', empty: 'NO_HIT' },
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
