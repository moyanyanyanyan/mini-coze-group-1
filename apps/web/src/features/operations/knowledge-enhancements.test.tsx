import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnchorHTMLAttributes } from 'react';
import { OperationsView, basePath, taskPath } from '@minicoze/ui/operations';
import { createOperationsMock } from './operations.mock';

function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) { return <a href={to} {...props} />; }
function fixture() {
  const data = createOperationsMock();
  const document = data.documents[0];
  const task = data.tasks.find(item => item.documentId === document.id)!;
  const date = new Date().toISOString();
  document.observed = { id: document.id, knowledgeBaseId: document.baseId, sourceSize: 0, title: document.name, sourceType: 'TEXT', originalFileName: null, status: 'READY', stage: 'COMPLETED', chunkCount: 0, error: null, createdAt: date, updatedAt: date, attempts: { recordedCount: 2, latestSource: 'RETRY', latestStatus: 'READY' } };
  task.observed = document.observed; task.status = 'ready';
  data.documents = [document]; data.tasks = [task];
  data.bases = data.bases.filter(base => base.id === document.baseId);
  document.history = { page: 1, pageSize: 20, total: 2, asOf: date, items: [
    { id: 'retry', ordinal: 2, source: 'RETRY', status: 'READY', stage: 'COMPLETED', startedAt: date, finishedAt: date, capturedAt: date, errorCode: null, errorMessage: null, events: [{ stage: 'COMPLETED', status: 'READY', at: date }] },
    { id: 'first', ordinal: 1, source: 'INITIAL', status: 'FAILED', stage: 'EMBEDDING', startedAt: date, finishedAt: date, capturedAt: date, errorCode: 'EMBEDDING_UNAVAILABLE', errorMessage: '当时的失败原因', events: [{ stage: 'EMBEDDING', status: 'FAILED', at: date }] },
  ] };
  return { data, document, task, render: (path: string) => renderToStaticMarkup(<OperationsView data={data} pathname={path} search="" LinkComponent={Link} />) };
}
describe('知识库用量与重试展示', () => {
  it('容量和 Token 分别标识来源，示例曲线可通过键盘访问', () => {
    const { document, render } = fixture();
    const html = render(basePath(document.baseId));
    expect(html).toContain('检索 Token');
    expect(html).toContain('示例数据');
    expect(html).toContain('检索用量未采集');
    expect(html).toContain('重试后完成 · 已记录 2 次处理');
    expect(html).toContain('原文件总大小：0 B');
    expect(html).not.toContain('原文件总大小：0 B，含模拟数据');
    expect((html.match(/aria-label="[^"]*示例 [\d,]+ Token"/g) ?? []).length).toBe(7);
  });
  it('成功后仍展示以前的失败与阶段，不把历史切片冒充当前版本', () => {
    const { document, task, render } = fixture();
    const html = render(taskPath(document.baseId, task.id));
    expect(html).toContain('手动重试');
    expect(html).toContain('首次处理');
    expect(html).toContain('当时的失败原因');
    expect(html).toContain('向量化 · 失败');
    expect(html).toContain('预览与切片为当前版本');
  });
  it('无历史不猜次数，旧快照不冒充首次处理', () => {
    const { document, task, render } = fixture();
    document.history!.items = []; document.history!.total = 0;
    expect(render(taskPath(document.baseId, task.id))).toContain('尚无处理历史');
    document.history!.items = [{ id: 'old', ordinal: 1, source: 'OBSERVED', status: 'FAILED', stage: 'FAILED', startedAt: null, finishedAt: null, capturedAt: new Date().toISOString(), errorCode: null, errorMessage: null, events: [] }];
    const html = render(taskPath(document.baseId, task.id));
    expect(html).toContain('接入时状态快照');
    expect(html).toContain('开始时间未知');
    expect(html).not.toContain('<strong>首次处理</strong>');
  });
});
