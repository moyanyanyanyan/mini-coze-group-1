import { useId, useState } from 'react';

// 检索向量化尚无 usage 接口，示例与实际容量独立，不能用于真实用量汇总。
const values = [780, 1120, 960, 1640, 1480, 1890, 2250];

export function KnowledgeTokenTrend({ snapshotAt }: { snapshotAt: number }) {
  const gradient = useId();
  const [active, setActive] = useState<number | null>(null);
  const total = values.reduce((sum, value) => sum + value, 0);
  const points = values.map((value, index) => ({ x: 12 + index * 76, y: 102 - value / 2400 * 82 }));
  const path = points.map((point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `C ${middle} ${previous.y} ${middle} ${point.y} ${point.x} ${point.y}`;
  }).join(' ');
  const dates = values.map((_, index) => new Date(snapshotAt - (6 - index) * 86400_000).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }));
  return <section className="om-k-token" aria-label="检索 Token 趋势示例">
    <div className="om-k-token-heading"><span>检索 Token</span><span className="om-k-sample">示例数据</span></div>
    <div className="om-k-token-number"><strong>{(total / 1000).toFixed(1)}<small>K</small></strong><span>近 7 天</span></div>
    <div className="om-k-token-chart">
      <svg viewBox="0 0 480 118" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        <path d={`${path} L 468 118 L 12 118 Z`} fill={`url(#${gradient})`} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="om-k-token-targets">{values.map((value, index) => <button key={index} type="button" aria-label={`${dates[index]}，示例 ${value.toLocaleString()} Token`}
        onFocus={() => setActive(index)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onClick={() => setActive(index)} />)}</div>
      <span className="om-k-token-tooltip" role="status">{active !== null ? `${dates[active]} · ${values[active].toLocaleString()} Token（示例）` : ''}</span>
    </div>
    <div className="om-k-token-axis"><span>{dates[0]}</span><span>{dates[6]}</span></div>
    <p className="om-note">检索用量未采集</p>
  </section>;
}
