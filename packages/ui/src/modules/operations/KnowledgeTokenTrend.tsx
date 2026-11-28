import { useId, useState } from 'react';
import type { OperationsKnowledgeActivity } from './records';

export function KnowledgeTokenTrend({ snapshotAt, daily = [] }: { snapshotAt: number; daily?: OperationsKnowledgeActivity['daily'] }) {
  const gradient = useId();
  const [active, setActive] = useState<number | null>(null);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(snapshotAt - (6 - index) * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }));
  const values = dates.map(date => daily.find(day => day.date === date)?.inputTokens ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(1, ...values);
  const points = values.map((value, index) => ({ x: 12 + index * 76, y: 102 - value / peak * 82 }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const missing = daily.reduce((sum, day) => sum + day.missingUsage, 0);
  return <section className="om-k-token" aria-label="知识库向量化 Token 趋势">
    <div className="om-k-token-heading"><span>向量化输入 Token</span><span>实际采集</span></div>
    <div className="om-k-token-number"><strong>{total.toLocaleString()}</strong><span>近 7 天</span></div>
    <div className="om-k-token-chart">
      <svg viewBox="0 0 480 118" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        <path d={`${path} L 468 118 L 12 118 Z`} fill={`url(#${gradient})`} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="om-k-token-targets">{values.map((value, index) => <button className="om-source-token-target" key={dates[index]} type="button" aria-label={`${dates[index]}，实际 ${value.toLocaleString()} Token`}
        onFocus={() => setActive(index)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onClick={() => setActive(index)} />)}</div>
      <span className="om-k-token-tooltip" role="status">{active !== null ? `${dates[active]} · ${values[active].toLocaleString()} Token` : ''}</span>
    </div>
    <div className="om-k-token-axis"><span>{dates[0].slice(5)}</span><span>{dates[6].slice(5)}</span></div>
    <p className="om-note">本地模型 tokenizer 实测，含文件索引与检索问题向量化；多库共用请求不拆分。{missing ? ` ${missing} 次历史请求未报告用量。` : ''}{!daily.length ? ' 尚无采集记录。' : ''}</p>
  </section>;
}
