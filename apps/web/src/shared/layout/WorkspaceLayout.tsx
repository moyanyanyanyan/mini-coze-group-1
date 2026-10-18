import type { ReactNode } from 'react';
import { workspaceNavigation } from '../../app/feature-registry';
import { AppLink } from '../routing/AppLink';
import { Icon } from '../ui/Icon';
import './workspace-layout.css';

interface WorkspaceLayoutProps {
  pathname: string;
  children: ReactNode;
}

export function WorkspaceLayout({ pathname, children }: WorkspaceLayoutProps) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="功能导航">
        <AppLink className="workspace-brand" to="/" aria-label="返回 MiniCoze 首页">
          <span className="workspace-brand-mark" aria-hidden="true">M</span>
          <span>MiniCoze</span>
        </AppLink>

        <nav className="workspace-nav">
          {workspaceNavigation.map((item) => {
            const isActive = pathname === item.route;

            return (
              <AppLink
                key={item.id}
                className={`workspace-nav-item${isActive ? ' is-active' : ''}`}
                to={item.route}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.navLabel}</span>
              </AppLink>
            );
          })}
        </nav>
      </aside>

      <main className="workspace-content">{children}</main>
    </div>
  );
}
