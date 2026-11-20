import { animateOperationsChange } from './motion';
import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { LinkComponentType } from '../../layouts/types';
import {
  duration,
  matchesText,
  operationsRoot,
  runSummary,
  type OperationRun,
  type OperationStage,
} from './model';

export const runLabels = { success: '成功', warning: '完成，有异常', failed: '失败', running: '运行中', cancelled: '已取消', interrupted: '采集中断' };

export const taskLabels = { ready: '可检索', processing: '向量化中', failed: '向量化失败' };

export function Badge({ children, tone = 'success' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`om-badge om-tone-${tone}`}>
      <i />
      {children}
    </span>
  );
}

export function Empty({
  children = '没有符合条件的记录，试试其他筛选条件。',
}: {
  children?: ReactNode;
}) {
  return <div className="om-empty">{children}</div>;
}

export function Panel({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="om-panel">
      <div className="om-panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stats({ items }: { items: { label: string; value: ReactNode; note?: string }[] }) {
  return (
    <div className="om-stats">
      {items.map((i) => (
        <div key={i.label}>
          <span>{i.label}</span>
          <strong>{i.value}</strong>
          {i.note && <small>{i.note}</small>}
        </div>
      ))}
    </div>
  );
}

export function Notice({
  title,
  children,
  tone = 'warning',
}: {
  title: string;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`om-notice om-tone-${tone}`}>
      <Icon name={tone === 'success' ? 'check' : 'stop'} />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function Cell({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <>
      <div className="om-cell-title">{title}</div>
      {subtitle && <div className="om-sub">{subtitle}</div>}
    </>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="om-page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

interface TableRow {
  id: string;
  text: string;
  status?: string;
  statuses?: string[];
  source?: string;
  cells: ReactNode[];
}

interface Filters {
  query: string;
  status: string;
  source: string;
  page: number;
}

// 保留当前应用会话的列表条件，进入详情再返回时不丢失；不保存业务数据。
const filterMemory = new Map<string, Filters>();

export function Records({
  id,
  title,
  headers,
  rows,
  statusOptions = [],
  sourceOptions = [],
  initialStatus = '',
  compact = false,
}: {
  id: string;
  title: string;
  headers: string[];
  rows: TableRow[];
  statusOptions?: [string, string][];
  sourceOptions?: string[];
  initialStatus?: string;
  compact?: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(() => ({
    query: '',
    status: '',
    source: '',
    page: 1,
    ...filterMemory.get(id),
    ...(initialStatus ? { status: initialStatus, page: 1 } : {}),
  }));
  const change = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    filterMemory.set(id, next);
    if (patch.query !== undefined) setFilters(next);
    else animateOperationsChange(() => setFilters(next));
  };
  const filtered = rows.filter(
    (r) =>
      matchesText(r.text, filters.query) &&
      (!filters.status || r.status === filters.status || r.statuses?.includes(filters.status)) &&
      (!filters.source || r.source === filters.source),
  );
  const pageSize = compact ? 4 : 6;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(filters.page, pages);
  const shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  return (
    <Panel title={title}>
      {!compact && (
        <div className="om-toolbar">
          <input
            type="search"
            aria-label={`${title}搜索`}
            placeholder="搜索名称、内容或 ID"
            value={filters.query}
            onChange={(e) => change({ query: e.target.value })}
          />
          <div>
            {sourceOptions.length > 0 && (
              <select
                aria-label="来源筛选"
                value={filters.source}
                onChange={(e) => change({ source: e.target.value })}
              >
                <option value="">全部来源</option>
                {sourceOptions.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
            {statusOptions.length > 0 && (
              <select
                aria-label="状态筛选"
                value={filters.status}
                onChange={(e) => change({ status: e.target.value })}
              >
                <option value="">全部状态</option>
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {(filters.query || filters.source || filters.status) && (
              <button onClick={() => change({ query: '', status: '', source: '' })}>
                清除筛选
              </button>
            )}
          </div>
        </div>
      )}
      <div className="om-table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                {r.cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <Empty />}
      <Pagination page={current} total={pages} label={`${title}分页`} onChange={page => change({ page })} />
    </Panel>
  );
}

export function Pagination({ page, total, onChange, label = '分页' }: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, total);
  const current = Math.max(1, Math.min(page, pages));
  return <nav className="om-pagination" aria-label={label}>
    <button type="button" aria-label="上一页" disabled={current === 1} onClick={() => onChange(current - 1)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 6-6 6 6 6" /></svg>
    </button>
    <select aria-label={`${label}页码`} value={current} onChange={event => onChange(Number(event.target.value))}>
      {Array.from({ length: pages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
    </select>
    <span aria-hidden="true">/ {pages}</span>
    <button type="button" aria-label="下一页" disabled={current === pages} onClick={() => onChange(current + 1)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m10 6 6 6-6 6" /></svg>
    </button>
  </nav>;
}

export function Breadcrumbs({
  items,
  LinkComponent: L,
}: {
  items: [string, string][];
  LinkComponent: LinkComponentType;
}) {
  return (
    <nav aria-label="面包屑" className="om-breadcrumb">
      <L to={operationsRoot}>运行管理</L>
      {items.map(([name, href], i) => (
        <span key={i}>
          / {href ? <L to={href}>{name}</L> : <span aria-current="page">{name}</span>}
        </span>
      ))}
    </nav>
  );
}

export function RunMetrics({ runs }: { runs: OperationRun[] }) {
  const s = runSummary(runs);
  const example = runs.length > 0 && !runs.some(run => run.observed);
  const suffix = example ? '（示例）' : '';
  return (
    <Stats
      items={[
        {
          label: `会话数${suffix}`,
          value: new Set(runs.map((r) => r.conversationId)).size,
        },
        { label: `执行次数${suffix}`, value: s.count },
        { label: `执行成功率${suffix}`, value: s.rate },
        { label: `平均耗时${suffix}`, value: s.average },
      ]}
    />
  );
}

export function Stages({
  stages,
  onNode,
}: {
  stages: OperationStage[];
  onNode?: (name: string) => ReactNode;
}) {
  const total = stages.reduce((n, s) => n + s.durationMs, 0);
  return (
    <ol className="om-stages">
      {stages.map((s) => (
        <li key={s.id ?? s.name}>
          <span className={`om-stage-dot om-tone-${s.status}`}>
            <Icon
              name={s.status === 'success' ? 'check' : s.status === 'failed' ? 'close' : 'more'}
            />
          </span>
          <div>
            <div className="om-stage-title">
              <strong>{s.name}</strong>
              <span>
                {s.status === 'interrupted' ? `中断 · ${duration(s.durationMs)}` : s.status === 'failed' ? `失败 · ${duration(s.durationMs)}` : s.status === 'pending'
                  ? '未执行'
                  : s.status === 'running'
                    ? `进行中 · ${duration(s.durationMs)}`
                    : s.durationMs
                      ? duration(s.durationMs)
                      : '完成'}
              </span>
            </div>
            <p>{s.description}</p>
            {onNode && s.durationMs > 0 && (
              <div className={`om-bar ${s.status === 'failed' ? 'is-failed' : ''}`}>
                <span style={{ width: `${total ? (s.durationMs / total) * 100 : 0}%` }} />
              </div>
            )}
            {onNode?.(s.name)}
          </div>
        </li>
      ))}
    </ol>
  );
}
