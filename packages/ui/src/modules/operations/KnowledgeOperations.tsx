import { basePath, taskPath, conversationPath, duration, dateTime } from './model';
import { PageHeader, Stats, Records, Cell, Badge, Empty } from './components';
import type { ContentProps } from './view-types';
import { BaseFiles } from './KnowledgeWorkspace';
export { Knowledge, Document } from './KnowledgeWorkspace';

export function Base(p: ContentProps & { baseId: string }) {
  return new URLSearchParams(p.search).get('tab') === 'retrieval' ? <RetrievalRecords {...p} /> : <BaseFiles {...p} />;
}

function RetrievalRecords(p: ContentProps & { baseId: string }) {
  const { data, baseId, LinkComponent: L } = p;
  const base = data.bases.find(row => row.id === baseId)!;
  const records = data.knowledgeActivity?.retrievals;
  const rows = records?.items ?? [];
  return <div className="om-knowledge">
    <PageHeader title={base.name} description="知识库模块实际执行的检索，包含聊天调用和检索测试。" />
    <nav className="om-tabs" aria-label="知识库运行内容"><L to={basePath(baseId)}>文件处理</L><L className="is-active" to={`${basePath(baseId)}?tab=retrieval`}>检索记录</L></nav>
    <Stats items={[
      { label: '检索记录总数', value: records?.total ?? 0, note: '从启用采集开始，包含失败与未命中' },
      { label: '本页返回切片', value: rows.reduce((sum, row) => sum + row.hits.length, 0), note: '仅本知识库返回的候选' },
      { label: '本页采用切片', value: rows.reduce((sum, row) => sum + row.hits.filter(hit => hit.used === true).length, 0), note: '按 Runtime 实际公告的引用计算' },
      { label: '本页平均耗时', value: rows.length ? duration(rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length) : '—', note: '整次检索耗时，含多库共用向量化' },
    ]} />
    {!rows.length && <Empty>当前没有检索记录；执行聊天检索或知识库检索测试后会自动出现。</Empty>}
    {rows.map(row => <details className="om-panel om-padding" key={row.id}>
      <summary><strong>{row.query}</strong> · {row.source === 'preview' ? '检索测试' : '聊天检索'} · <Badge tone={row.status === 'HIT' ? 'success' : row.status === 'FAILED' ? 'failed' : 'neutral'}>{row.status === 'HIT' ? '命中' : row.status === 'FAILED' ? '失败' : '未命中'}</Badge> · {duration(row.durationMs)}</summary>
      <p className="om-note">{dateTime(Date.parse(row.startedAt))} · {row.id}</p>
      {row.hits.map(hit => <details className="om-snippet" key={hit.chunkId}><summary>{hit.documentTitle} · 相似度 {hit.score.toFixed(3)} · {hit.used === true ? '送入模型' : hit.used === false ? '未采用' : row.source === 'preview' ? '测试检索，未调用模型' : '采用情况未记录'}</summary><p>{hit.content}</p><small>{hit.documentId} · {hit.chunkId}</small><p><L to={taskPath(baseId, hit.documentId)}>查看来源文件与切片 →</L></p></details>)}
      {row.runId && row.conversationId && row.agentId && <L to={`${conversationPath(row.agentId, row.conversationId)}?run=${row.runId}&node=knowledge`}>查看实际执行链路 →</L>}
    </details>)}
    {records && records.total > records.pageSize && <nav className="om-tabs" aria-label="检索记录分页">
      {records.page > 1 && <L to={`${basePath(baseId)}?tab=retrieval&page=${records.page - 1}`}>上一页</L>}
      <span>第 {records.page} / {Math.ceil(records.total / records.pageSize)} 页</span>
      {records.page * records.pageSize < records.total && <L to={`${basePath(baseId)}?tab=retrieval&page=${records.page + 1}`}>下一页</L>}
    </nav>}
  </div>;
}
