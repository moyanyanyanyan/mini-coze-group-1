import type { OperationsAgent, OperationsBase, OperationsConversations, OperationsDocuments, OperationsDocument, OperationsDocumentText, OperationsDocumentAttempt, OperationsChunk, OperationsMessages, OperationsRuntimeRun, OperationsRuntimeDetail, OperationsRuntimeStats, OperationsPageResult } from '@minicoze/shared';
import { parseOperationsRoute, type OperationsData, type OperationRun, type RunStatus } from '@minicoze/ui/operations';
import { ApiError, get } from '../../shared/api/http';
import { createOperationsMock } from './operations.mock';

async function read<T>(path: string): Promise<T> {
  const response = await get<{ code: number; message: string; data: T }>(path);
  if (response.code !== 200 || response.data == null) throw new Error(response.message || '读取运行数据失败');
  return response.data;
}

// 目录只加载元数据；消息、事件和切片仅在相应详情页请求。
async function catalog<T>(path: string): Promise<T[]> {
  const first = await read<OperationsPageResult<T>>(`${path}?pageSize=100&page=1`);
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / 100); page++) {
    items.push(...(await read<OperationsPageResult<T>>(`${path}?pageSize=100&page=${page}`)).items);
  }
  return items;
}

export function observedStatus(run: OperationsRuntimeRun): RunStatus {
  if (run.messageStatus === 'failed') return 'failed';
  if (run.messageStatus === 'cancelled' || run.status === 'cancelled') return 'cancelled';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'interrupted') return 'interrupted';
  if (run.status === 'running' || run.messageStatus === 'pending' || run.messageStatus === 'running') return 'running';
  return run.messageStatus === 'completed' && run.status === 'completed' ? 'success' : 'interrupted';
}

export function replaceRuntime(template: OperationRun, observed: OperationsRuntimeRun): OperationRun {
  return {
    ...template, id: observed.id, conversationId: observed.conversationId, startedAt: Date.parse(observed.startedAt),
    status: observedStatus(observed), question: observed.question || '（本次提问内容不可用）', answer: observed.answer ?? '',
    durationMs: observed.durationMs ?? template.durationMs, firstTokenMs: observed.firstTokenMs,
    inputTokens: observed.inputTokens ?? template.inputTokens, outputTokens: observed.outputTokens ?? template.outputTokens,
    // 未提供的字段保留示例，但聚合与实际链路必须以 observed 为准。
    retrievals: [], plugin: undefined, observed,
  };
}

export async function loadOperations(pathname: string, search: string, userId: string, runPages = 1): Promise<OperationsData> {
  const mock = createOperationsMock();
  const route = parseOperationsRoute(pathname);
  const params = new URLSearchParams(search);
  const api = '/api/operations';
  const [agents, bases, stats] = await Promise.all([
    catalog<OperationsAgent>(`${api}/agents`), catalog<OperationsBase>(`${api}/knowledge-bases`), read<OperationsRuntimeStats>(`${api}/runtime/stats`),
  ]);
  const actualConversation = route.page === 'conversation' && !mock.conversations.some(c => c.id === route.conversationId);
  const filter = actualConversation ? `&conversationId=${encodeURIComponent(route.conversationId)}` : '';
  const first = await read<OperationsPageResult<OperationsRuntimeRun>>(`${api}/runtime/runs?pageSize=100&page=1${filter}`);
  const runs = [...first.items];
  for (let page = 2; page <= Math.min(runPages, Math.ceil(first.total / 100)); page++) runs.push(...(await read<OperationsPageResult<OperationsRuntimeRun>>(`${api}/runtime/runs?pageSize=100&page=${page}${filter}`)).items);
  const hasRealRuns = stats.total > 0 || actualConversation;
  const data: OperationsData = {
    ...mock, examples: mock, connected: true, runtimeStats: stats, snapshotAt: Date.now(), loadedRuns: runs.length, totalRuns: first.total,
    agents: agents.map(agent => ({ id: agent.id, name: agent.name, description: agent.description ?? '', actual: true, conversationCount: agent.conversationCount })),
    conversations: [], runs: [],
    bases: bases.length ? bases.map(base => ({ id: base.id, name: base.name, description: base.description, observed: base })) : mock.bases.map(base => ({ ...base, name: `${base.name}（示例）` })),
    documents: bases.length ? [] : mock.documents,
    tasks: bases.length ? [] : mock.tasks,
  };
  if (!hasRealRuns) {
    data.agents.push(...mock.agents.map(agent => ({ ...agent, name: `${agent.name}（示例）` })));
    data.conversations = mock.conversations.map(c => ({ ...c, title: `${c.title}（示例）` }));
    data.runs = mock.runs;
  }
  for (const run of runs) {
    if (!data.agents.some(agent => agent.id === run.agentId)) data.agents.push({ id: run.agentId, name: '历史智能体', description: '采集记录关联的智能体', actual: true });
    if (!data.conversations.some(c => c.id === run.conversationId)) data.conversations.push({ id: run.conversationId, agentId: run.agentId, title: run.conversationTitle ?? '历史会话', source: '未采集', actor: '当前用户' });
    data.runs.push(replaceRuntime(mock.runs[0], run));
  }
  if (route.page === 'conversations' && agents.some(agent => agent.id === route.agentId)) {
    const conversations = await catalog<OperationsConversations['items'][number]>(`${api}/agents/${encodeURIComponent(route.agentId)}/conversations`);
    data.conversations = data.conversations.filter(c => c.agentId !== route.agentId).concat(conversations.map(c => ({ id: c.id, agentId: route.agentId, title: c.title, source: '未采集' as const, actor: '当前用户' })));
  }
  if (actualConversation && route.page === 'conversation') {
    const messages = await read<OperationsMessages>(`${api}/conversations/${encodeURIComponent(route.conversationId)}/messages?pageSize=100`);
    if (messages.conversation.agentId !== route.agentId) throw new ApiError(404, 'NOT_FOUND', '会话不存在或不可访问');
    if (!data.conversations.some(c => c.id === route.conversationId)) data.conversations.push({ id: route.conversationId, agentId: route.agentId, title: messages.conversation.title, source: '未采集', actor: '当前用户' });
    data.messages = messages.items;
    const selected = params.get('run') ?? runs[0]?.id;
    if (selected) {
      const detail = await read<OperationsRuntimeDetail>(`${api}/runtime/runs/${encodeURIComponent(selected)}`);
      if (detail.conversationId !== route.conversationId) throw new ApiError(404, 'NOT_FOUND', '执行记录不属于当前会话');
      const existing = data.runs.find(run => run.id === selected);
      if (existing) existing.observed = { ...existing.observed!, ...detail };
      else {
        const assistant = messages.items.find(message => message.id === detail.assistantMessageId);
        const question = messages.items.find(message => message.role === 'user' && message.seq === (assistant?.seq ?? 0) - 1);
        data.runs.push({ ...replaceRuntime(mock.runs[0], { ...detail, question: question?.content, answer: assistant?.content }), observed: detail });
      }
    }
  }
  // 首页也需要文件明细，用于容量分布和最近错误；不加载正文或切片。
  const documentBases = route.page === 'knowledge' ? bases : (route.page === 'base' || route.page === 'document') ? bases.filter(base => base.id === route.baseId) : [];
  for (const base of documentBases) {
    const documents = await catalog<OperationsDocument>(`${api}/knowledge-bases/${encodeURIComponent(base.id)}/documents`);
    for (const document of documents) {
      const template = mock.documents[0];
      data.documents.push({ ...template, id: document.id, baseId: document.knowledgeBaseId, name: document.title, chunks: [], observed: document });
      data.tasks.push({ ...mock.tasks[0], id: document.id, documentId: document.id, status: document.status === 'READY' ? 'ready' : document.status === 'FAILED' ? 'failed' : 'processing', startedAt: Date.parse(document.createdAt), error: document.error?.message ?? undefined, snapshot: undefined, observed: document });
    }
    if (route.page === 'document') {
      const document = data.documents.find(d => d.id === route.taskId);
      if (!document) throw new ApiError(404, 'NOT_FOUND', '文档不存在或不可访问');
      const text = await read<OperationsDocumentText>(`${api}/knowledge-bases/${encodeURIComponent(route.baseId)}/documents/${encodeURIComponent(document.id)}/text`);
      if (text.id !== document.id || text.knowledgeBaseId !== route.baseId) throw new ApiError(404, 'NOT_FOUND', '文档不存在或不可访问');
      document.parsedText = text.rawText;
      const historyPage = params.get('historyPage') ?? '1';
      document.history = await read<OperationsPageResult<OperationsDocumentAttempt>>(`${api}/knowledge-bases/${encodeURIComponent(route.baseId)}/documents/${encodeURIComponent(document.id)}/attempts?pageSize=20&page=${encodeURIComponent(historyPage)}`);
      if (document.observed?.status === 'READY' && bases.find(base => base.id === route.baseId)?.status === 'ACTIVE') {
        const scope = `workspaceId=${encodeURIComponent(userId)}`;
        const path = `/api/knowledge-bases/${encodeURIComponent(route.baseId)}/documents/${encodeURIComponent(document.id)}/chunks`;
        const firstChunks = await read<OperationsPageResult<OperationsChunk>>(`${path}?${scope}&page=1`);
        const chunks = [...firstChunks.items];
        for (let page = 2; page <= Math.ceil(firstChunks.total / firstChunks.pageSize); page++) chunks.push(...(await read<OperationsPageResult<OperationsChunk>>(`${path}?${scope}&page=${page}`)).items);
        document.chunks = chunks.map(chunk => ({ id: chunk.id, position: chunk.position, content: chunk.content, start: chunk.startOffset, end: chunk.endOffset, enabled: chunk.enabled }));
      }
    }
  }
  return data;
}
