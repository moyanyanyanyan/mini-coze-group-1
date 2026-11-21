import type { ReactNode } from 'react';
import './PurpleGlassCard.css';

export interface PurpleGlassCardProps {
  title: ReactNode;
  actionLink?: ReactNode;
  description: ReactNode;
  logo?: ReactNode;
  actions?: { id: string; label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }[];
  action?: { label: string; onClick: () => void; disabled?: boolean };
}

/** 基于 chase2k25 原作，保留五层圆片、玻璃顶面和原始悬浮位移。 */
export function PurpleGlassCard({ title, description, logo, actions = [], action, actionLink }: PurpleGlassCardProps) {
  return <article className="uv-card-parent">
    <div className="uv-card-card">
      <div className="uv-card-logo" aria-hidden="true">
        {[1, 2, 3, 4].map(n => <span key={n} className={`uv-card-circle uv-card-circle${n}`} />)}
        <span className="uv-card-circle uv-card-circle5">{logo ?? (<svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 29.667 31.69"
          className="uv-card-svg" aria-hidden="true"
        >
          <path
            d="M12.827,1.628A1.561,1.561,0,0,1,14.31,0h2.964a1.561,1.561,0,0,1,1.483,1.628v11.9a9.252,9.252,0,0,1-2.432,6.852q-2.432,2.409-6.963,2.409T2.4,20.452Q0,18.094,0,13.669V1.628A1.561,1.561,0,0,1,1.483,0h2.98A1.561,1.561,0,0,1,5.947,1.628V13.191a5.635,5.635,0,0,0,.85,3.451,3.153,3.153,0,0,0,2.632,1.094,3.032,3.032,0,0,0,2.582-1.076,5.836,5.836,0,0,0,.816-3.486Z"
            transform="translate(0 0)"
          ></path>
          <path
            d="M75.207,20.857a1.561,1.561,0,0,1-1.483,1.628h-2.98a1.561,1.561,0,0,1-1.483-1.628V1.628A1.561,1.561,0,0,1,70.743,0h2.98a1.561,1.561,0,0,1,1.483,1.628Z"
            transform="translate(-45.91 0)"
          ></path>
          <path
            d="M0,80.018A1.561,1.561,0,0,1,1.483,78.39h26.7a1.561,1.561,0,0,1,1.483,1.628v2.006a1.561,1.561,0,0,1-1.483,1.628H1.483A1.561,1.561,0,0,1,0,82.025Z"
            transform="translate(0 -51.963)"
          ></path>
        </svg>)}</span>
      </div>
      <div className="uv-card-glass" aria-hidden="true" />
      <div className="uv-card-content"><span className="uv-card-title">{title}</span><div className="uv-card-text">{description}</div></div>
      <div className="uv-card-bottom">
        <div className="uv-card-social-buttons-container">{actions.map(item => <button type="button" className="uv-card-social-button" key={item.id} aria-label={item.label} disabled={item.disabled} onClick={item.onClick}>{item.icon}</button>)}</div>
        {actionLink && <div className="uv-card-view-more">{actionLink}</div>}
        {action && <div className="uv-card-view-more"><button type="button" className="uv-card-view-more-button" disabled={action.disabled} onClick={action.onClick}>{action.label}</button><svg className="uv-card-svg" aria-hidden="true" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></div>}
      </div>
    </div>
  </article>;
}
