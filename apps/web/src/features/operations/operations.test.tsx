import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  OperationsView,
  agentPath,
  baseSummary,
  byteLength,
  conversationPath,
  latestTask,
  operationsRoot,
  parseOperationsRoute,
  runSummary,
  taskPath,
  withinDays,
} from '@minicoze/ui/operations';
import type { AnchorHTMLAttributes } from 'react';
import { createOperationsMock } from './operations.mock';

const now = Date.parse('2026-11-14T14:35:00+08:00');
const data = createOperationsMock(now);
function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={to} {...props} />;
}
const render = (pathname: string, search = '') =>
  renderToStaticMarkup(
    <OperationsView data={data} pathname={pathname} search={search} LinkComponent={Link} />,
  );

describe('运行管理模拟数据与统计', () => {
  it('统计由同一份执行记录计算，并区分节点异常和执行失败', () => {
    const runs = data.runs.filter((r) => withinDays(r.startedAt, 1, now));
    const summary = runSummary(runs);
    expect(summary.count).toBe(72);
    expect(summary.failed).toBe(6);
    expect(summary.warnings).toBe(6);
    expect(summary.rate).toBe('91.7%');
    expect(runSummary([]).rate).toBe('—');
    expect(data.runs.filter((r) => withinDays(r.startedAt, 7, now))).toHaveLength(84);
    expect(data.runs.filter((r) => withinDays(r.startedAt, 30, now))).toHaveLength(96);
    expect(withinDays(now + 1, 1, now)).toBe(false);
  });

  it('每次检索的文档和切片属于其知识库，并关联到有效会话', () => {
    for (const run of data.runs) {
      expect(data.conversations.some((c) => c.id === run.conversationId)).toBe(true);
      expect(run.durationMs).toBe(run.stages.reduce((sum, s) => sum + s.durationMs, 0));
      for (const retrieval of run.retrievals) {
        for (const hit of retrieval.hits) {
          const document = data.documents.find((d) => d.id === hit.documentId)!;
          expect(document.baseId).toBe(retrieval.baseId);
          expect(document.chunks.some((c) => c.id === hit.chunkId)).toBe(true);
          expect(latestTask(data, document.id)?.status).toBe('ready');
        }
      }
    }
  });

  it('容量只计入就绪文件的切片，并保留历史快照', () => {
    const summary = baseSummary(data, 'kb-1');
    const documents = data.documents.filter((d) => d.baseId === 'kb-1');
    const ready = documents.filter((d) => latestTask(data, d.id)?.status === 'ready');
    expect(summary.files).toBe(8);
    expect(summary.processing).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.chunkCount).toBe(ready.reduce((n, d) => n + d.chunks.length, 0));
    expect(summary.sourceBytes).toBe(documents.reduce((n, d) => n + d.sourceBytes, 0));
    expect(data.tasks.find((t) => t.id === 'task-1-7')!.snapshot!.sourceBytes).toBeLessThan(
      summary.sourceBytes,
    );
    expect(data.tasks.find((t) => t.id === 'task-1-3')!.snapshot).toBeUndefined();
    expect(data.tasks.filter((t) => t.documentId === 'doc-1-2')).toHaveLength(2);
    expect(latestTask(data, 'doc-1-2')?.attempt).toBe(2);
    expect(latestTask(data, 'doc-1-2')?.status).toBe('ready');
    const retrySnapshot = latestTask(data, 'doc-1-2')!.snapshot!;
    expect(retrySnapshot.sourceBytesBefore).toBe(retrySnapshot.sourceBytes);
  });

  it('切片范围和重叠来自实际模拟文本，字节大小不会使用字符数冒充', () => {
    for (const document of data.documents) {
      document.chunks.forEach((chunk, index) => {
        expect(chunk.content.length).toBe(chunk.end - chunk.start);
        expect(chunk.content.length).toBeLessThanOrEqual(600);
        if (index) expect(document.chunks[index - 1].end - chunk.start).toBe(80);
      });
    }
    expect(byteLength('你好')).toBe(6);
  });
});

describe('运行管理页面与边界', () => {
  it('支持深链接，拒绝不存在的路径和跨父级资源', () => {
    expect(parseOperationsRoute(taskPath('kb-1', 'task-1-1'))).toEqual({
      page: 'document',
      baseId: 'kb-1',
      taskId: 'task-1-1',
    });
    expect(parseOperationsRoute(`${operationsRoot}/agents/a/unknown`)).toEqual({
      page: 'not-found',
    });
    expect(render(taskPath('kb-2', 'task-1-1'))).toContain('记录不存在');
    expect(render(conversationPath('agent-2', 'conversation-1-1'))).toContain('记录不存在');
    expect(render(conversationPath('agent-1', 'conversation-1-1'), 'run=run-2-1-1')).toContain(
      '不属于当前会话',
    );
  });

  it('智能体列表每条记录链接自己的会话列表', () => {
    const html = render(`${operationsRoot}/agents`);
    for (const agent of data.agents) expect(html).toContain(`href="${agentPath(agent.id)}"`);
    expect(html).toContain('模拟数据 · 未连接后端');
  });

  it('失败与完成但有异常分别显示，未命中不是失败', () => {
    const warning = render(conversationPath('agent-1', 'conversation-1-1'), 'run=run-1-1-2');
    expect(warning).toContain('回答已完成，存在节点异常');
    expect(warning).toContain('node=plugin');
    const failure = render(conversationPath('agent-1', 'conversation-1-5'));
    expect(failure).toContain('本轮执行失败');
    const noHit = render(conversationPath('agent-1', 'conversation-1-7'), 'node=knowledge');
    expect(noHit).toContain('检索正常执行，但未返回相关切片');
  });

  it('文件处理失败仍展示上传成功，处理中不会显示可检索结果', () => {
    const failure = render(taskPath('kb-1', 'task-1-3'));
    expect(failure).toContain('文件接收成功');
    expect(failure).toContain('向量化服务暂时不可用');
    expect(failure).toContain('未执行');
    const processing = render(taskPath('kb-1', 'task-1-4'));
    expect(processing).toContain('正在生成向量');
    expect(processing).toContain('已生成，尚未入库');
    expect(processing).not.toContain('历史快照');
  });
});

describe('运行概览摘要与今日错误', () => {
  it('今日错误排除昨天记录，最新运行展示聊天 Token 明细', () => {
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    const fixture = { ...data, runs: [
      { ...data.runs[0], id: 'today-run', question: '今日错误样本', status: 'failed' as const, startedAt: midnight, inputTokens: 123, outputTokens: 45 },
      { ...data.runs[0], id: 'yesterday-run', question: '昨日错误样本', status: 'failed' as const, startedAt: midnight - 1 },
    ], tasks: [] };
    const html = renderToStaticMarkup(<OperationsView data={fixture} pathname={operationsRoot} search="" LinkComponent={Link} />);
    const errors = html.split('aria-label="今日运行错误"')[1].split('最新运行')[0];
    expect(errors).toContain('今日错误样本');
    expect(errors).not.toContain('昨日错误样本');
    expect(html).toContain('输入 123 / 输出 45');
    expect(html).toContain('Token 消耗');
    expect(html).toContain('错误模块');
    expect(html).toContain('错误时间排序');
  });
  it('没有记录时显示空态和零统计', () => {
    const html = renderToStaticMarkup(<OperationsView data={{ ...data, runs: [], tasks: [] }} pathname={operationsRoot} search="" LinkComponent={Link} />);
    expect(html).toContain('今天没有符合筛选条件的错误');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});

describe('会话执行详情渐进展开', () => {
  it('默认仅显示对话，并为每轮提供明确的查看入口', () => {
    const html = render(conversationPath('agent-1', 'conversation-1-1'));
    expect(html).toContain('查看第 1 轮执行链路');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="执行链路详情"');
    expect(html).not.toContain('正在查看第');
  });
  it('选择第二轮时打开对应链路，提供返回未选中状态的入口', () => {
    const html = render(conversationPath('agent-1', 'conversation-1-1'), 'run=run-1-1-2');
    expect(html).toContain('aria-label="执行链路详情"');
    expect(html).toContain('第 2 轮 · 执行链路');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="返回对话记录"');
    expect(html).toContain('回答已完成，存在节点异常');
  });
});
