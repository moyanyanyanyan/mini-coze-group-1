import type { OperationsAgent, OperationsBase, OperationsConversations, OperationsDocument, OperationsDocumentText, OperationsDocumentAttempt, OperationsChunk, OperationsMessages, OperationsRuntimeRun, OperationsRuntimeDetail, OperationsRuntimeStats, OperationsPageResult, OperationsResources, OperationsKnowledgeActivity, OperationsIntegrationActivity } from '@minicoze/shared';
import { parseOperationsRoute, type OperationsData, type OperationRun, type RunStatus } from '@minicoze/ui/operations';
import { ApiError, get } from '../../shared/api/http';
import { getConversationMemory } from '../agent-chat/api/chat-api';
import { knowledgeDocumentDownloadUrl } from '../knowledge/knowledge.api';
import { parseRuntimeStages } from '../../../../../packages/shared/src/runtime-stages';

async function read<T>(path: string): Promise<T> {
  const response = await get<{ code: number; message: string; data: T }>(path);
  if (response.code !== 200 || response.data == null) throw new Error(response.message || '读取运行数据失败');
  return response.data;
}

// 完整读取分页元数据，统计不再只覆盖首批一百条记录。
async function catalog<T extends { id: string }>(path: string): Promise<T[]> {
  const separator = path.includes('?') ? '&' : '?';
  const first = await read<OperationsPageResult<T>>(`${path}${separator}pageSize=100&page=1`);
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) items.push(...(await read<OperationsPageResult<T>>(`${path}${separator}pageSize=${first.pageSize}&page=${page}`)).items);
  return [...new Map(items.map(item => [item.id, item])).values()];
}

export function observedStatus(run: OperationsRuntimeRun): RunStatus {
  if (run.messageStatus === 'failed' || run.status === 'failed') return 'failed';
  if (run.messageStatus === 'cancelled' || run.status === 'cancelled') return 'cancelled';
  if (run.status === 'interrupted') return 'interrupted';
  if (run.status === 'running' || run.messageStatus === 'pending' || run.messageStatus === 'running') return 'running';
  return run.messageStatus === 'completed' && run.status === 'completed' ? run.hasWarnings ? 'warning' : 'success' : 'interrupted';
}

export function replaceRuntime(observed: OperationsRuntimeRun): OperationRun {
  return { id: observed.id, conversationId: observed.conversationId, startedAt: Date.parse(observed.startedAt), status: observedStatus(observed),
    question: observed.question || '（本次提问内容不可用）', answer: observed.answer ?? '', durationMs: observed.durationMs, firstTokenMs: observed.firstTokenMs,
    inputTokens: observed.inputTokens, outputTokens: observed.outputTokens, retrievals: [], stages: [], observed };
}
const sourceLabel = (source?: string) => source === 'web' ? '平台聊天' as const : source === 'api' ? 'SDK/API' as const : '历史未记录' as const;

export async function loadOperations(pathname: string, search: string, userId: string): Promise<OperationsData> {
  const route = parseOperationsRoute(pathname);
  const params = new URLSearchParams(search);
  const api = '/api/operations';
  const [agents, bases, stats] = await Promise.all([
    catalog<OperationsAgent>(`${api}/agents`), catalog<OperationsBase>(`${api}/knowledge-bases`), read<OperationsRuntimeStats>(`${api}/runtime/stats`),
  ]);
  const data: OperationsData = { connected: true, runtimeStats: stats, snapshotAt: Date.now(),
    agents: agents.map(agent => ({ id: agent.id, name: agent.name, description: agent.description ?? '', actual: true, conversationCount: agent.conversationCount })),
    bases: bases.map(base => ({ id: base.id, name: base.name, description: base.description, observed: base })),
    conversations: [], runs: [], documents: [], tasks: [] };
  const filter = route.page === 'conversation' ? `?conversationId=${encodeURIComponent(route.conversationId)}` : '';
  const runs = await catalog<OperationsRuntimeRun>(`${api}/runtime/runs${filter}`);
  data.loadedRuns = runs.length; data.totalRuns = runs.length;
  for (const run of runs) {
    if (!data.agents.some(agent => agent.id === run.agentId)) data.agents.push({ id: run.agentId, name: '历史智能体', description: '采集记录关联的智能体', actual: true });
    const existing = data.conversations.find(c => c.id === run.conversationId);
    if (!existing) data.conversations.push({ id: run.conversationId, agentId: run.agentId, title: run.conversationTitle ?? '历史会话', source: sourceLabel(run.source), actor: '当前用户' });
    else if (existing.source !== sourceLabel(run.source)) existing.source = existing.source === '历史未记录' || sourceLabel(run.source) === '历史未记录' ? '历史未记录' : '混合来源';
    data.runs.push(replaceRuntime(run));
  }
  if (route.page === 'resources') {
    data.resources = await read<OperationsResources>(`${api}/resources`);
    data.integrationActivity = await read<OperationsIntegrationActivity>(`${api}/integrations/activity?pageSize=20&page=${encodeURIComponent(params.get('page') ?? '1')}`);
  }
  if (route.page === 'conversations') {
    const conversations = await catalog<OperationsConversations['items'][number]>(`${api}/agents/${encodeURIComponent(route.agentId)}/conversations`);
    data.conversations = conversations.map(c => ({ id: c.id, agentId: route.agentId, title: c.title, source: data.conversations.find(row => row.id === c.id)?.source ?? '历史未记录', actor: '当前用户' }));
  }
  if (route.page === 'conversation') {
    const messages = await read<OperationsMessages>(`${api}/conversations/${encodeURIComponent(route.conversationId)}/messages?pageSize=100`);
    if (messages.conversation.agentId !== route.agentId) throw new ApiError(404, 'NOT_FOUND', '会话不存在或不可访问');
    if (!data.conversations.some(c => c.id === route.conversationId)) data.conversations.push({ id: route.conversationId, agentId: route.agentId, title: messages.conversation.title, source: '历史未记录', actor: '当前用户' });
    data.messages = messages.items;
    for (let page = 2; page <= Math.ceil(messages.total / messages.pageSize); page++) {
      const older = await read<OperationsMessages>(`${api}/conversations/${encodeURIComponent(route.conversationId)}/messages?pageSize=100&page=${page}`);
      data.messages = [...older.items, ...data.messages];
    }
    try { data.memory = await getConversationMemory(route.conversationId); }
    catch (error) { data.memoryError = error instanceof Error ? error.message : '读取会话记忆失败'; }
    const selected = params.get('run') ?? runs[0]?.id;
    if (selected) {
      const detail = await read<OperationsRuntimeDetail>(`${api}/runtime/runs/${encodeURIComponent(selected)}`);
      if (detail.conversationId !== route.conversationId) throw new ApiError(404, 'NOT_FOUND', '执行记录不属于当前会话');
      const existing = data.runs.find(run => run.id === selected);
      const stages = parseRuntimeStages(detail.events.filter(event => event.type === 'runtime.stage').map(event => event.data));
      if (existing) existing.observed = { ...existing.observed!, ...detail, stages };
      else {
        const assistant = data.messages.find(message => message.id === detail.assistantMessageId);
        const question = data.messages.find(message => message.role === 'user' && message.seq === (assistant?.seq ?? 0) - 1);
        data.runs.push({ ...replaceRuntime({ ...detail, question: question?.content, answer: assistant?.content }), observed: { ...detail, stages } });
      }
    }
  }
  const documentBases = route.page === 'knowledge' || route.page === 'overview' ? bases : (route.page === 'base' || route.page === 'document') ? bases.filter(base => base.id === route.baseId) : [];
  if ((route.page === 'base' || route.page === 'document') && !documentBases.length) throw new ApiError(404, 'NOT_FOUND', '知识库不存在或不可访问');
  for (const base of documentBases) {
    const documents = await catalog<OperationsDocument>(`${api}/knowledge-bases/${encodeURIComponent(base.id)}/documents`);
    for (const document of documents) {
      data.documents.push({ id: document.id, baseId: document.knowledgeBaseId, name: document.title, sourceBytes: document.sourceSize ?? 0, chunks: [], observed: document, downloadUrl: knowledgeDocumentDownloadUrl(document.id, userId) });
      const attempt = document.latestAttempt;
      data.tasks.push({ id: document.id, documentId: document.id, status: document.status === 'READY' ? 'ready' : document.status === 'FAILED' ? 'failed' : 'processing',
        startedAt: Date.parse(attempt?.startedAt ?? document.createdAt), error: document.error?.message ?? undefined, observed: document,
        attempt: attempt?.ordinal ?? 0, stages: [], uploadMs: 0, processingMs: attempt?.startedAt && attempt.finishedAt ? Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt) : 0 });
    }
    if (route.page === 'base') data.knowledgeActivity = await read<OperationsKnowledgeActivity>(`${api}/knowledge-bases/${encodeURIComponent(base.id)}/activity?pageSize=20&page=${encodeURIComponent(params.get('page') ?? '1')}`);
    if (route.page === 'document') {
      const document = data.documents.find(d => d.id === route.taskId);
      if (!document) throw new ApiError(404, 'NOT_FOUND', '文档不存在或不可访问');
      const text = await read<OperationsDocumentText>(`${api}/knowledge-bases/${encodeURIComponent(route.baseId)}/documents/${encodeURIComponent(document.id)}/text`);
      if (text.id !== document.id || text.knowledgeBaseId !== route.baseId) throw new ApiError(404, 'NOT_FOUND', '文档不存在或不可访问');
      document.parsedText = text.rawText;
      document.history = await read<OperationsPageResult<OperationsDocumentAttempt>>(`${api}/knowledge-bases/${encodeURIComponent(route.baseId)}/documents/${encodeURIComponent(document.id)}/attempts?pageSize=20&page=${encodeURIComponent(params.get('historyPage') ?? '1')}`);
      if (document.observed?.status === 'READY') {
        const chunks = await catalog<OperationsChunk>(`/api/knowledge-bases/${encodeURIComponent(route.baseId)}/documents/${encodeURIComponent(document.id)}/chunks?workspaceId=${encodeURIComponent(userId)}`);
        document.chunks = chunks.map(chunk => ({ id: chunk.id, position: chunk.position, content: chunk.content, start: chunk.startOffset, end: chunk.endOffset, enabled: chunk.enabled }));
      }
    }
  }
  return data;
}
