import { TokenActivity } from './TokenActivity';
import { animateOperationsChange } from './motion';
import { useState } from 'react';
import { conversationPath, taskPath, duration, dateTime } from './model';
import { PageHeader, Panel, Badge, Cell, Empty, Records, runLabels, taskLabels } from './components';
import type { ContentProps } from './view-types';

export function Overview(p: ContentProps) {
  const { data, LinkComponent: L } = p;
  const [module, setModule] = useState('');
  const [order, setOrder] = useState('newest');
  const [page, setPage] = useState(1);
  const events = [
    ...data.runs.map(r => {
      const c = data.conversations.find(c => c.id === r.conversationId)!;
      return { id: r.id, at: r.startedAt, title: r.question, module: 'Agent 聊天',
        status: r.status, badge: runLabels[r.status],
        error: r.stages.filter(s => s.status === 'failed').map(s => `${s.name}：${s.description}`).join('；'),
        href: `${conversationPath(c.agentId, c.id)}?run=${r.id}`, durationMs: r.durationMs,
        inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    }),
    ...data.tasks.map(t => {
      const d = data.documents.find(d => d.id === t.documentId)!;
      return { id: t.id, at: t.startedAt, title: d.name, module: '知识库', status: t.status,
        badge: taskLabels[t.status], error: t.error ?? t.stages.filter(s => s.status === 'failed').map(s => `${s.name}：${s.description}`).join('；'),
        href: taskPath(d.baseId, t.id), durationMs: t.uploadMs + t.processingMs,
        inputTokens: null, outputTokens: null };
    }),
  ].filter(e => e.at <= data.snapshotAt).sort((a, b) => b.at - a.at);
  // 今日按快照所在的本地自然日计算，不使用滚动 24 小时窗口。
  const midnight = new Date(data.snapshotAt).setHours(0, 0, 0, 0);
  const errors = events.filter(e => e.at >= midnight && (e.status === 'failed' || e.status === 'warning'));
  const filtered = errors.filter(e => !module || e.module === module)
    .sort((a, b) => order === 'newest' ? b.at - a.at : a.at - b.at);
  const pages = Math.max(1, Math.ceil(filtered.length / 4));
  const current = Math.min(page, pages);
  const runs = data.runs.filter(r => r.startedAt <= data.snapshotAt);
  const tokens = runs.map(r => r.inputTokens + r.outputTokens);
  const metrics = [
    ['累计 Token', tokens.reduce((sum, n) => sum + n, 0).toLocaleString()],
    ['单次 Token 峰值', Math.max(0, ...tokens).toLocaleString()],
  ];
  return <>
    <PageHeader title="运行概览" description="查看今日异常与最新运行情况。" />
    <div className="om-overview-top">
      <section className="om-profile" aria-label="运行摘要">
        <div className="om-profile-identity">
          {p.profile?.avatarUrl ? <img className="om-profile-avatar" src={p.profile.avatarUrl} alt="" /> : <span className="om-profile-avatar" aria-hidden="true">{p.profile?.displayName.slice(0, 1) || 'M'}</span>}
          <div>
            <h2>{p.profile?.displayName || '当前工作空间'}</h2>
            <p>{p.profileError || p.profile?.email || '运行数据摘要'}</p>
          </div>
        </div>
        <span className="om-note">工作空间 · 当前模拟快照</span>
        <dl className="om-profile-metrics">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <TokenActivity runs={runs} snapshotAt={data.snapshotAt} />
      </section>
      <section className="om-today" aria-label="今日运行错误">
        <Panel title={<>今日运行错误 <span className="om-count">{errors.length}</span></>} action={<span className="om-sub">{new Date(data.snapshotAt).toLocaleDateString('zh-CN')}</span>}>
          <div className="om-error-filters">
            <select aria-label="错误模块" value={module} onChange={e => { const value = e.target.value; animateOperationsChange(() => { setModule(value); setPage(1); }); }}>
              <option value="">全部模块</option><option>Agent 聊天</option><option>知识库</option>
              <option value="数据库" disabled>数据库（尚未接入）</option>
            </select>
            <select aria-label="错误时间排序" value={order} onChange={e => { const value = e.target.value; animateOperationsChange(() => { setOrder(value); setPage(1); }); }}>
              <option value="newest">最新优先</option><option value="oldest">最早优先</option>
            </select>
          </div>
          {filtered.slice((current - 1) * 4, current * 4).map(e => <div className="om-attention" key={e.id}>
            <div><div className="om-attention-title"><span className="om-cell-title">{e.title}</span><Badge tone={e.status}>{e.badge}</Badge></div>
              <div className="om-sub">{e.module} · {dateTime(e.at)}</div><div className="om-error-description">{e.error || e.badge}</div></div>
            <L className="om-entry" title="查看错误与执行详情" to={e.href}>查看详情</L>
          </div>)}
          {!filtered.length && <Empty>今天没有符合筛选条件的错误。</Empty>}
          <div className="om-table-footer"><span role="status">共 {filtered.length} 条 · {current} / {pages}</span><div>
            <button aria-label="错误上一页" disabled={current === 1} onClick={() => animateOperationsChange(() => setPage(current - 1))}>上一页</button>
            <button aria-label="错误下一页" disabled={current === pages} onClick={() => animateOperationsChange(() => setPage(current + 1))}>下一页</button>
          </div></div>
        </Panel>
      </section>
    </div>
    <Records compact id="overview-events" title="最新运行" headers={['运行内容', '模块', '状态', 'Token 消耗', '总耗时', '开始时间', '操作']}
      rows={events.map(e => ({ id: e.id, text: `${e.title} ${e.id}`, cells: [
        <Cell title={<L to={e.href}>{e.title}</L>} subtitle={e.id} />, e.module, <Badge tone={e.status}>{e.badge}</Badge>,
        e.inputTokens === null ? '—' : <Cell title={(e.inputTokens + (e.outputTokens ?? 0)).toLocaleString()} subtitle={`输入 ${e.inputTokens.toLocaleString()} / 输出 ${e.outputTokens?.toLocaleString()}`} />,
        duration(e.durationMs), dateTime(e.at), <L to={e.href}>查看</L>,
      ] }))} />
  </>;
}
