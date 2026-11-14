import { useState } from 'react';
import type { OperationRun } from './model';

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function tokenActivity(runs: OperationRun[], snapshotAt: number) {
  const today = new Date(snapshotAt);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // 从 11 周前的周一开始，按自然日递增，避免夏令时影响日期。
  start.setDate(start.getDate() - (start.getDay() + 6) % 7 - 77);
  const totals = new Map<string, number>();
  for (const run of runs) {
    if (run.startedAt < start.getTime() || run.startedAt > snapshotAt) continue;
    const key = dayKey(new Date(run.startedAt));
    totals.set(key, (totals.get(key) ?? 0) + run.inputTokens + run.outputTokens);
  }
  return Array.from({ length: 84 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: dayKey(date), total: totals.get(dayKey(date)) ?? 0, future: date.getTime() > snapshotAt };
  });
}

export function TokenActivity({ runs, snapshotAt }: { runs: OperationRun[]; snapshotAt: number }) {
  const days = tokenActivity(runs, snapshotAt);
  const last = days.filter(day => !day.future).length - 1;
  const [selected, setSelected] = useState<number | null>(null);
  const [focused, setFocused] = useState(last);
  const peak = Math.max(1, ...days.map(day => day.total));
  const current = days[selected ?? last];
  return <section className="om-token-activity" aria-label="Token 活动热力图">
    <div className="om-token-heading"><h3>Token 活动</h3><span>最近 12 周</span></div>
    <div className="om-token-calendar">
      <div className="om-token-weekdays" aria-hidden="true"><span>一</span><span>三</span><span>日</span></div>
      <div className="om-token-grid" onMouseLeave={() => setSelected(null)}>
        {days.map((day, index) => day.future ? <span key={day.date} className="om-token-future" /> :
          <button key={day.date} type="button" className="om-token-day" data-level={day.total ? Math.max(1, Math.ceil(day.total / peak * 4)) : 0}
            aria-label={`${day.date}：${day.total.toLocaleString()} Token`} title={`${day.date} · ${day.total.toLocaleString()} Token`}
            tabIndex={focused === index ? 0 : -1} onMouseEnter={() => setSelected(index)}
            onFocus={() => { setFocused(index); setSelected(index); }} onClick={() => setSelected(index)}
            onKeyDown={event => {
              const offset = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
              if (offset === undefined) return;
              event.preventDefault();
              const next = Math.max(0, Math.min(last, index + offset));
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
              buttons?.[next]?.focus();
            }} />)}
      </div>
    </div>
    <div className="om-token-range"><span>{days[0].date.slice(5)}</span><span>{days[last].date.slice(5)}</span></div>
    <div className="om-token-reading" aria-live="polite">{current.date} · <strong>{current.total.toLocaleString()}</strong> Token</div>
    <div className="om-token-legend" aria-label="颜色越深，单日 Token 消耗越多"><span>少</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>多</span></div>
  </section>;
}
