import type { ReactNode } from 'react';
import './EditorialStatCard.css';

export interface EditorialStatCardProps {
  value: ReactNode;
  unit?: ReactNode;
  caption: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  stamp?: ReactNode;
  action?: { label: string; href: string };
}

export function EditorialStatCard({ value, unit, caption, meta, badge, stamp, action }: EditorialStatCardProps) {
  return <article className="uv-stat-tile">
    <header className="uv-stat-tile__head"><span className="uv-stat-tile__meta">{meta}</span>{badge && <span className="uv-stat-tile__badge">{badge}</span>}</header>
    <div className="uv-stat-tile__body"><p className="uv-stat-tile__number"><span className="uv-stat-tile__digits">{value}{unit && <span className="uv-stat-tile__unit">{unit}</span>}</span></p><p className="uv-stat-tile__caption">{caption}</p></div>
    {(action || stamp) && <footer className="uv-stat-tile__foot">{action && <a className="uv-stat-tile__link" href={action.href}><span>{action.label}</span><span className="uv-stat-tile__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg></span></a>}<span className="uv-stat-tile__rule" aria-hidden="true" /><span className="uv-stat-tile__stamp">{stamp}</span></footer>}
  </article>;
}
