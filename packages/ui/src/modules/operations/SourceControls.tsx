import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { IconMenu } from '../../components/uiverse/IconMenu';

// From Uiverse.io by another-kennyotsu — sharp-fox-30。
export function KeycapButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" className="om-source-keycap"><span>{children}</span><i aria-hidden="true" /></button>;
}

// From Uiverse.io by uiverse-astronaut — purple-zebra-62。时间筛选不是内容面板，使用按钮组语义。
export function RangeTabs({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const values = [1, 7, 30];
  return <div className="om-source-tabs" role="group" aria-label="时间范围">
    {values.map(days => <button type="button" key={days} className={`om-source-tab${value === days ? ' is-active' : ''}`} aria-pressed={value === days}
      onClick={() => onChange(days)}>{days === 1 ? '24 小时' : `${days} 天`}</button>)}
  </div>;
}

export function MenuFilter({ label, value, items, onChange }: {
  label: string; value: string; items: { id: string; label: string; icon?: ReactNode; disabled?: boolean }[]; onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  return <details className="om-source-filter" ref={ref} onKeyDown={event => {
    if (event.key === 'Escape' && ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); }
  }}>
    <summary aria-label={label}>{items.find(item => item.id === value)?.label ?? label}<span aria-hidden="true">⌄</span></summary>
    <IconMenu label={label} items={items} selectedId={value} onSelect={id => {
      onChange(id);
      if (ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); }
    }} />
  </details>;
}
