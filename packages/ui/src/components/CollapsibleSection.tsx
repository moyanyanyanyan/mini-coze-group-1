import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import './collapsible-section.css';

export interface CollapsibleSectionProps {
  title: string;
  badge?: ReactNode;
  /** 标题行右侧的独立操作，点击不会触发展开/收起。 */
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title, badge, actions, defaultOpen = false, children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`ui-collapse${open ? ' is-open' : ''}`}>
      <div className="ui-collapse-head">
        <button
          type="button"
          className="ui-collapse-trigger"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="chevronDown" className="ui-collapse-chevron" />
          <span className="ui-collapse-title">{title}</span>
          {badge !== undefined && badge !== null && (
            <span className="ui-collapse-badge">{badge}</span>
          )}
        </button>
        {actions && <div className="ui-collapse-actions">{actions}</div>}
      </div>
      {open && <div className="ui-collapse-body">{children}</div>}
    </section>
  );
}
