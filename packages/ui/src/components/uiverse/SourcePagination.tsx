import './SourcePagination.css';

export interface SourcePaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label?: string;
}

/** 基于第 14 款 marque-pager；真实页码由调用方控制。 */
export function SourcePagination({ page, totalPages, onChange, label = '分页' }: SourcePaginationProps) {
  const total = Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
  const current = Math.max(1, Math.min(total, Math.floor(Number.isFinite(page) ? page : 1)));
  const visible = Array.from(new Set([1, current - 1, current, current + 1, total])).filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  return <nav className="uv-marque-pager" aria-label={label}>
    <button type="button" className="uv-marque-pager__edge" aria-label="上一页" disabled={current === 1} onClick={() => onChange(current - 1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
    <ol className="uv-marque-pager__list">{visible.flatMap((n, i) => [
      ...(i > 0 && n - visible[i - 1] > 1 ? [<li key={`gap-${n}`} className="uv-marque-pager__gap" aria-hidden="true">···</li>] : []),
      <li key={n}><button type="button" className="uv-marque-pager__page" aria-label={`第 ${n} 页`} aria-current={n === current ? 'page' : undefined} onClick={() => onChange(n)}>{n}</button></li>,
    ])}</ol>
    <button type="button" className="uv-marque-pager__edge uv-marque-pager__edge--primary" aria-label="下一页" disabled={current === total} onClick={() => onChange(current + 1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
    <input className="uv-marque-pager__jump" type="number" aria-label={`${label}页码`} title="输入页码后按 Enter 跳转" min={1} max={total} key={`${current}-${total}`} defaultValue={current} onKeyDown={event => {
      if (event.key === 'Enter') { const next = event.currentTarget.valueAsNumber; if (Number.isInteger(next) && next >= 1 && next <= total) onChange(next); }
    }} />
  </nav>;
}
