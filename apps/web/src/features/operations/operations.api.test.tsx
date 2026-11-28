import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OperationsRuntimeRun, OperationsRuntimeStats } from '@minicoze/shared';
import { parseRuntimeStages } from '../../../../../packages/shared/src/runtime-stages';
import { OperationsView, runSummary, conversationPath } from '@minicoze/ui/operations';
import { get } from '../../shared/api/http';
import { loadOperations, replaceRuntime } from './operations.api';
import { createOperationsMock } from './operations.mock';
import { getConversationMemory } from '../agent-chat/api/chat-api';
vi.mock('../agent-chat/api/chat-api', () => ({ getConversationMemory: vi.fn() }));

vi.mock('../../shared/api/http', async importOriginal => ({ ...await importOriginal<object>(), get: vi.fn() }));
const now = new Date().toISOString();
const run: OperationsRuntimeRun = {
  id: 'actual-run', agentId: 'actual-agent', conversationId: 'actual-conversation', assistantMessageId: 'message',
  mode: 'stream', model: 'model', status: 'completed', messageStatus: 'completed', startedAt: now, finishedAt: now,
  durationMs: 123, firstTokenMs: 10, inputTokens: 0, outputTokens: 0, totalTokens: 0, errorCode: null, truncated: false,
  question: '实际提问', answer: '实际回复', conversationTitle: '实际会话',
};
const stats: OperationsRuntimeStats = { total: 1, running: 0, reported: 1, missingUsage: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, peakTokens: 0, averageDurationMs: 123, asOf: now };
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 100, asOf: now });
function responses(rows = [run], summary = stats) {
  vi.mocked(get).mockImplementation(async path => {
    let data: unknown;
    if (path.includes('/runtime/stats')) data = summary;
    else if (path.includes('/runtime/runs?')) data = page(rows);
    else if (path.includes('/runtime/runs/')) data = { ...run, events: [{ type: 'tool.completed', observedAt: now, data: { toolName: 'actual-tool' } }], asOf: now };
    else if (path.includes('/messages')) data = { ...page([]), conversation: { id: run.conversationId, agentId: run.agentId, title: '实际会话' } };
    else if (path.includes('/agents?')) data = page([{ id: run.agentId, name: '实际 Agent', description: '', conversationCount: 1 }]);
    else data = page([]);
    return { code: 200, message: 'ok', data } as never;
  });
}
const Link = ({ to, children }: { to: string; children?: React.ReactNode }) => <a href={to}>{children}</a>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getConversationMemory).mockRejectedValue(new Error('记忆暂不可用'));
});
describe('原运行页面内接入采集数据', () => {
  it('统计完整分页并按 ID 去重，超过首批 100 条的记录不会遗漏', async () => {
    responses();
    const fallback = vi.mocked(get).getMockImplementation()!;
    vi.mocked(get).mockImplementation(async path => {
      if (path.includes('/runtime/runs?')) {
        const second = new URL('http://local' + path).searchParams.get('page') === '2';
        return { code: 200, data: { items: second ? [{ ...run, id: 'run-101' }, { ...run, id: 'run-100' }] : Array.from({ length: 100 }, (_, i) => ({ ...run, id: `run-${i+1}` })), total: 101, pageSize: 100, page: second ? 2 : 1 } } as never;
      }
      return fallback(path);
    });
    const data = await loadOperations('/workspace/operations', '', 'owner');
    expect(data.runs).toHaveLength(101);
    expect(data.runs.some(row => row.id === 'run-101')).toBe(true);
    expect(vi.mocked(get).mock.calls.some(([path]) => path.includes('page=2'))).toBe(true);
  });
  it('记忆接口失败不影响真实对话与执行链路，也不伪造额度', async () => {
    responses();
    const path = conversationPath(run.agentId, run.conversationId);
    const data = await loadOperations(path, '', 'owner');
    const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search="" LinkComponent={Link} />);
    expect(getConversationMemory).toHaveBeenCalledWith(run.conversationId);
    expect(html).toContain('记忆暂不可用');
    expect(html).toContain('实际提问');
    expect(html).not.toContain('约剩');
  });
  it('已完成的新聊天进入最新运行，并点亮当天 Token 格子', async () => {
    responses([{ ...run, question: '累累', totalTokens: 2793, inputTokens: 2000, outputTokens: 793 }]);
    const data = await loadOperations('/workspace/operations', '', 'owner');
    const html = renderToStaticMarkup(<OperationsView data={data} pathname="/workspace/operations" search="" LinkComponent={Link} />);
    const today = new Date(now);
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(html).toContain('>累累</a>');
    expect(html).toContain(`class="om-token-day" data-level="4" aria-label="${key}：2,793 Token"`);
    expect(html).toContain(`?run=${run.id}`);
  });
  it('仅展示四类已采集阶段和多轮模型，保留零值', async () => {
    responses();
    const path = conversationPath(run.agentId, run.conversationId);
    const data = await loadOperations(path, `run=${run.id}`, 'owner');
    data.runs[0].observed!.events = ['retrieval', 'context', 'model', 'tool', 'model'].map((kind, index) => ({
      type: 'runtime.stage', observedAt: now, data: { stageId: `s${index}`, kind, startedAt: now, durationMs: 0,
        status: kind === 'tool' ? 'failed' : 'completed', round: index === 4 ? 2 : 1,
        chunkCount: kind === 'retrieval' || kind === 'context' ? 0 : undefined,
        usage: kind === 'model' ? { promptTokens: 0, completionTokens: 0, totalTokens: 0 } : undefined },
    }));
    data.runs[0].observed!.stages = parseRuntimeStages(data.runs[0].observed!.events!.map(event => event.data));
    const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search={`run=${run.id}`} LinkComponent={Link} />);
    expect(html).toContain('内部阶段（实际采集');
    expect(html).toContain('模型调用 · 第 2 轮');
    expect(html).toContain('返回 0 个切片');
    expect(html).toContain('本轮已报告 Token：输入 0 / 输出 0');
    expect(html).toContain('失败 · 0 ms');
    expect(html).not.toContain('接收请求');
    expect(html).not.toContain('回复完成');
    expect(html).not.toContain('知识库检索（示例）');
    expect(html).not.toContain('模型调用 · 工具选择（示例）');
    expect(html).not.toContain('订单查询插件（示例）');
  });
  it('真实问答及零用量替换示例，链路不拼入虚构调用', async () => {
    responses();
    const path = conversationPath(run.agentId, run.conversationId);
    const data = await loadOperations(path, `run=${run.id}`, 'owner');
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]).toMatchObject({ question: '实际提问', answer: '实际回复', inputTokens: 0, outputTokens: 0, retrievals: [] });
    expect(data.runs[0].plugin).toBeUndefined();
    const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search={`run=${run.id}`} LinkComponent={Link} />);
    expect(html).toContain('实际提问');
    expect(html).toContain('actual-tool');
    expect(html).toContain('暂无阶段数据');
    expect(html).not.toContain('（示例）');
    expect(html).not.toContain('Mock 演示');
    expect(html).not.toContain('om-mode-switch');
  });
  it('检索失败仅显示实际失败阶段，缺失指标不使用示例补位', async () => {
    responses();
    const path = conversationPath(run.agentId, run.conversationId);
    const data = await loadOperations(path, `run=${run.id}`, 'owner');
    const observed = { ...run, status: 'failed', messageStatus: 'failed', durationMs: null, firstTokenMs: null,
      inputTokens: null, outputTokens: null, totalTokens: null, errorCode: 'KNOWLEDGE_TIMEOUT' };
    const row = replaceRuntime(observed);
    row.observed = { ...observed, events: [
      { type: 'runtime.stage', observedAt: now, data: { stageId: 'retrieval', kind: 'retrieval', startedAt: now,
        durationMs: 10020, status: 'failed', errorCode: 'KNOWLEDGE_TIMEOUT' } },
      { type: 'run.failed', observedAt: now, data: { code: 'KNOWLEDGE_TIMEOUT' } },
    ] };
    row.observed.stages = parseRuntimeStages(row.observed.events?.filter(event => event.type === 'runtime.stage').map(event => event.data));
    data.runs = [row];
    const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search={`run=${run.id}`} LinkComponent={Link} />);
    expect(html).toContain('知识库检索（已采集）');
    expect(html).toContain('失败 · 10.02 s');
    expect(html).toContain('调用耗时 <b>未采集</b>');
    expect(html).toContain('首字响应 <b>未采集</b>');
    expect(html).toContain('Token <b>未报告</b>');
    expect(html).toContain('输入 未报告 / 输出 未报告 Token');
    expect(html).not.toContain('（示例）');
    expect(html).not.toContain('接收请求');
    expect(html).not.toContain('回复完成');
    expect(html).not.toContain('模型调用');
    expect(html).not.toContain('工具执行');
  });
  it('缺失指标保留为空，不生成示例数值或影响统计', () => {
    const row = replaceRuntime({ ...run, durationMs: null, totalTokens: null, inputTokens: null, outputTokens: null, status: 'running', messageStatus: 'pending' });
    expect(row.durationMs).toBeNull();
    expect(runSummary([row])).toMatchObject({ rate: '—', average: '—' });
  });
  it('无采集记录时显示真实空态，不向目录或图表注入示例', async () => {
    responses([], { ...stats, total: 0, reported: 0, totalTokens: null });
    const data = await loadOperations('/workspace/operations', '', 'owner');
    expect(data.runs).toEqual([]);
    expect(data.bases).toEqual([]);
    expect(data.conversations.some(c => c.agentId === run.agentId)).toBe(false);
    const html = renderToStaticMarkup(<OperationsView data={data} pathname="/workspace/operations" search="" LinkComponent={Link} />);
    expect(html).toContain('累计已报告 Token');
    expect(html).not.toContain('示例');
    expect(html).toContain('om-overview-top');
  });
  it('读取失败明确抛出，不退回示例成功结果', async () => {
    vi.mocked(get).mockRejectedValue(new Error('网络失败'));
    await expect(loadOperations('/workspace/operations', '', 'owner')).rejects.toThrow('网络失败');
  });
  it('文档使用实际字节数和解析正文，保留未采集阶段说明', async () => {
    responses();
    const fallback = vi.mocked(get).getMockImplementation()!;
    vi.mocked(get).mockImplementation(async path => {
      let data: unknown;
      if (path.includes('/knowledge-bases?')) data = page([{ id: 'kb', name: '实际知识库', description: '', status: 'ACTIVE', documentCount: 1, availableChunkCount: 1, processingDocuments: 0, failedDocuments: 0 }]);
      else if (path.includes('/chunks?')) {
        expect(path).toContain('workspaceId=owner');
        data = page([{ id: 'chunk', position: 0, content: '实际切片正文', startOffset: 0, endOffset: 6, enabled: true }]);
      } else if (path.endsWith('/kb/documents/doc/text')) data = { id: 'doc', knowledgeBaseId: 'kb', rawText: '实际解析正文' };
      else if (path.includes('/kb/documents?')) data = page([{ id: 'doc', knowledgeBaseId: 'kb', title: '实际文档', sourceSize: 12, status: 'READY', stage: 'COMPLETED', sourceType: 'TEXT', originalFileName: null, chunkCount: 1, error: null, createdAt: now, updatedAt: now }]);
      else return fallback(path);
      return { code: 200, message: 'ok', data } as never;
    });
    const path = '/workspace/operations/knowledge/kb/documents/doc';
    const data = await loadOperations(path, '', 'owner');
    expect(data.documents[0].chunks[0].content).toBe('实际切片正文');
    expect(data.tasks[0].observed?.stage).toBe('COMPLETED');
    const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search="" LinkComponent={Link} />);
    expect(html).toContain('实际文档');
    expect(html).toContain('文件大小');
    expect(html).toContain('12 B');
    expect(html).toContain('实际解析正文');
    expect(html).not.toContain('模拟预览 · 非真实原文件');
    expect(html).toContain('历史未记录完整阶段');
    expect(html).not.toContain('文件接收成功');
    const chunksHtml = renderToStaticMarkup(<OperationsView data={data} pathname={path} search="tab=chunks" LinkComponent={Link} />);
    expect(chunksHtml).toContain('实际切片正文');
  });
  it('选中记录必须属于当前会话', async () => {
    responses();
    await expect(loadOperations(conversationPath('wrong-agent', run.conversationId), '', 'owner')).rejects.toThrow('会话不存在');
  });
});

describe('知识库运行首页目录加载', () => {
  it('加载各库文件元数据用于错误列表，不提前请求切片', async () => {
    responses();
    const fallback = vi.mocked(get).getMockImplementation()!;
    vi.mocked(get).mockImplementation(async path => {
      if (path.includes('/knowledge-bases?')) return { code: 200, data: page([{ id: 'kb', name: '真实知识库', description: '', status: 'ACTIVE', documentCount: 1, availableChunkCount: 0, processingDocuments: 0, failedDocuments: 1 }]) } as never;
      if (path.includes('/kb/documents?')) return { code: 200, data: page([{ id: 'failed-doc', knowledgeBaseId: 'kb', title: '失败文件.pdf', status: 'FAILED', stage: 'CHUNKING', sourceType: 'FILE', originalFileName: '失败文件.pdf', chunkCount: 0, error: { code: 'CHUNKING_FAILED', message: '真实切片错误' }, createdAt: now, updatedAt: now }]) } as never;
      return fallback(path);
    });
    const data = await loadOperations('/workspace/operations/knowledge', '', 'owner');
    expect(data.documents).toHaveLength(1);
    expect(data.tasks[0].status).toBe('failed');
    expect(vi.mocked(get).mock.calls.some(([url]) => url.includes('/chunks?'))).toBe(false);
    const html = renderToStaticMarkup(<OperationsView data={data} pathname="/workspace/operations/knowledge" search="" LinkComponent={Link} />);
    expect(html).toContain('真实切片错误');
    expect(html).toContain('/documents/failed-doc?focus=error');
    const overview = renderToStaticMarkup(<OperationsView data={data} pathname="/workspace/operations" search="" LinkComponent={Link} />);
    expect(overview).toContain('切片失败');
    expect(overview).not.toContain('向量化失败');
  });
});

it.each(['messages', 'without-run', 'run-fallback'])('运行管理助手正文渲染 Markdown：%s', async mode => {
  responses();
  const path = conversationPath(run.agentId, run.conversationId);
  const data = await loadOperations(path, '', 'owner');
  const content = '### 第一幕\n\n**提瓦特代码日志**\n\n- 调查异常请求\n\n```ts\nconst traveler = "林夜";\n```\n\n<script>alert(1)</script>';
  data.runs[0].answer = content;
  data.messages = mode === 'run-fallback' ? [] : [
    { id: 'user', role: 'user', status: 'completed', content: '**保留用户原文**' },
    { id: 'message', role: 'assistant', status: 'completed', content },
  ];
  if (mode === 'without-run') data.runs = [];
  const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search="" LinkComponent={Link} />);
  expect(html).toContain('<h3>第一幕</h3>');
  expect(html).toContain('<strong>提瓦特代码日志</strong>');
  expect(html).toContain('<li>调查异常请求</li>');
  expect(html).toContain('class="language-ts"');
  expect(html).not.toContain('<script>');
  if (mode !== 'run-fallback') expect(html).toContain('**保留用户原文**');
});
