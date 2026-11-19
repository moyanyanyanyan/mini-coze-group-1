import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OperationsRuntimeRun, OperationsRuntimeStats } from '@minicoze/shared';
import { OperationsView, runSummary, conversationPath } from '@minicoze/ui/operations';
import { get } from '../../shared/api/http';
import { loadOperations, replaceRuntime } from './operations.api';
import { createOperationsMock } from './operations.mock';

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
beforeEach(() => vi.resetAllMocks());
describe('原运行页面内接入采集数据', () => {
  it('四类实际阶段替换对应示例，保留未采集步骤并展示多轮模型', async () => {
    responses();
    const path = conversationPath(run.agentId, run.conversationId);
    const data = await loadOperations(path, `run=${run.id}`, 'owner');
    data.runs[0].observed!.events = ['retrieval', 'context', 'model', 'tool', 'model'].map((kind, index) => ({
      type: 'runtime.stage', observedAt: now, data: { stageId: `s${index}`, kind, startedAt: now, durationMs: 0,
        status: kind === 'tool' ? 'failed' : 'completed', round: index === 4 ? 2 : 1,
        chunkCount: kind === 'retrieval' || kind === 'context' ? 0 : undefined,
        usage: kind === 'model' ? { promptTokens: 0, completionTokens: 0, totalTokens: 0 } : undefined },
    }));
    const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search={`run=${run.id}`} LinkComponent={Link} />);
    expect(html).toContain('内部阶段（实际采集');
    expect(html).toContain('模型调用 · 第 2 轮');
    expect(html).toContain('返回 0 个切片');
    expect(html).toContain('本轮已报告 Token：输入 0 / 输出 0');
    expect(html).toContain('失败 · 0 ms');
    expect(html).toContain('接收请求（示例）');
    expect(html).toContain('回复完成（示例）');
    expect(html).not.toContain('知识库检索（示例）');
    expect(html).not.toContain('模型调用 · 工具选择（示例）');
    expect(html).not.toContain('订单查询插件（示例）');
  });
  it('真实问答及零用量替换示例，链路不拼入虚构调用', async () => {
    responses();
    const path = conversationPath(run.agentId, run.conversationId);
    const data = await loadOperations(path, `run=${run.id}`, 'owner');
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]).toMatchObject({ question: '实际提问', answer: '实际回复', inputTokens: 0, outputTokens: 0, retrievals: [], plugin: undefined });
    const html = renderToStaticMarkup(<OperationsView data={data} pathname={path} search={`run=${run.id}`} LinkComponent={Link} />);
    expect(html).toContain('实际提问');
    expect(html).toContain('actual-tool');
    expect(html).toContain('内部阶段示例');
    expect(html).not.toContain('Mock 演示');
    expect(html).not.toContain('om-mode-switch');
  });
  it('缺失指标仍保留原示例，但不进入实际耗时及成功率统计', () => {
    const row = replaceRuntime(createOperationsMock().runs[0], { ...run, durationMs: null, totalTokens: null, inputTokens: null, outputTokens: null, status: 'running', messageStatus: 'pending' });
    expect(row.durationMs).toBeGreaterThan(0);
    expect(runSummary([row])).toMatchObject({ rate: '—', average: '—' });
  });
  it('无采集记录时在原页保留已标注示例，真实 Agent 不被赋予示例会话', async () => {
    responses([], { ...stats, total: 0, reported: 0, totalTokens: null });
    const data = await loadOperations('/workspace/operations', '', 'owner');
    expect(data.runs.length).toBeGreaterThan(0);
    expect(data.runs.every(row => !row.observed)).toBe(true);
    expect(data.conversations.some(c => c.agentId === run.agentId)).toBe(false);
    const html = renderToStaticMarkup(<OperationsView data={data} pathname="/workspace/operations" search="" LinkComponent={Link} />);
    expect(html).toContain('累计 Token（示例）');
    expect(html).toContain('om-overview-top');
  });
  it('读取失败明确抛出，不退回示例成功结果', async () => {
    vi.mocked(get).mockRejectedValue(new Error('网络失败'));
    await expect(loadOperations('/workspace/operations', '', 'owner')).rejects.toThrow('网络失败');
  });
  it('文档在原详情布局显示实际阶段和切片，未采集字节数明确为示例', async () => {
    responses();
    const fallback = vi.mocked(get).getMockImplementation()!;
    vi.mocked(get).mockImplementation(async path => {
      let data: unknown;
      if (path.includes('/knowledge-bases?')) data = page([{ id: 'kb', name: '实际知识库', description: '', status: 'ACTIVE', documentCount: 1, availableChunkCount: 1, processingDocuments: 0, failedDocuments: 0 }]);
      else if (path.includes('/chunks?')) {
        expect(path).toContain('workspaceId=owner');
        data = page([{ id: 'chunk', position: 0, content: '实际切片正文', startOffset: 0, endOffset: 6, enabled: true }]);
      } else if (path.includes('/kb/documents?')) data = page([{ id: 'doc', knowledgeBaseId: 'kb', title: '实际文档', status: 'READY', stage: 'COMPLETED', sourceType: 'TEXT', originalFileName: null, chunkCount: 1, error: null, createdAt: now, updatedAt: now }]);
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
    expect(html).toContain('模拟数据');
    expect(html).toContain('模拟预览 · 非真实原文件');
    expect(html).toContain('阶段耗时：未采集');
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
  });
});
