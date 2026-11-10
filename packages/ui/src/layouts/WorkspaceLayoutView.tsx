import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/types';
import { useOverlayFocus } from '../hooks/useOverlayFocus';
import type { LinkComponentType } from './types';
import './workspace-layout.css';

export interface WorkspaceLayoutViewProps {
  pathname: string;
  children: ReactNode;
  navigation: readonly { id: string; route: string; navLabel: string; icon: IconName }[];
  user: { displayName?: string | null; email: string; avatarUrl?: string | null } | null;
  LinkComponent: LinkComponentType;
  onLogout: () => void;
  onOpenWorkspace: () => void;
}

export function WorkspaceLayoutView({ pathname, children, navigation, user: me, LinkComponent, onLogout, onOpenWorkspace }: WorkspaceLayoutViewProps) {
  const editorMode = pathname.includes('/workflows') || pathname.includes('/chat');
  const [navPreference, setNavPreference] = useState<boolean | null>(() => {
    const stored = sessionStorage.getItem('workspace-nav-collapsed');
    return stored === null ? null : stored === 'true';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useOverlayFocus(sidebarRef, mobileNavOpen, () => setMobileNavOpen(false));
  const collapsed = navPreference ?? editorMode;
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 点到菜单外面就把它收起来
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  // displayName 没填过就退回邮箱，再不行显示「未登录」
  const displayName = me ? me.displayName || me.email : '未登录';

  return (
    <div className={`workspace-shell${collapsed ? ' is-editor-mode' : ''}${mobileNavOpen ? ' is-nav-open' : ''}`}>
      <button className="workspace-mobile-toggle" aria-label="打开导航" onClick={() => setMobileNavOpen(true)}><Icon name="menu" /> 菜单</button>
      {mobileNavOpen && <button className="workspace-nav-backdrop" aria-label="关闭导航" onClick={() => setMobileNavOpen(false)} />}
      <aside ref={sidebarRef} className="workspace-sidebar" aria-label="功能导航" role={mobileNavOpen ? 'dialog' : undefined} aria-modal={mobileNavOpen || undefined}>
        <button className="workspace-collapse" aria-label={collapsed ? '展开导航' : '收起导航'} onClick={() => {
          setNavPreference(!collapsed);
          sessionStorage.setItem('workspace-nav-collapsed', String(!collapsed));
          setMobileNavOpen(false);
        }}><Icon name="panel" /></button>
        <LinkComponent className="workspace-brand" to="/" aria-label="返回 MiniCoze 首页">
          <span className="workspace-brand-mark" aria-hidden="true">M</span>
          <span>MiniCoze</span>
        </LinkComponent>

        <nav className="workspace-nav">
          {navigation.map((item) => {
            const isActive = pathname === item.route || (item.route !== '/workspace' && pathname.startsWith(`${item.route}/`));

            return (
              <LinkComponent
                key={item.id}
                className={`workspace-nav-item${isActive ? ' is-active' : ''}`}
                to={item.route}
                title={item.navLabel}
                aria-label={item.navLabel}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.navLabel}</span>
              </LinkComponent>
            );
          })}
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-user" ref={menuRef}>
            <button
              type="button"
              className="workspace-user-trigger"
              aria-label="账户菜单"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="workspace-avatar" aria-hidden="true">
                {me?.avatarUrl ? (
                  <img src={me.avatarUrl} alt="" />
                ) : (
                  displayName.trim().charAt(0).toUpperCase() || '?'
                )}
              </span>
              <span className="workspace-user-name">{displayName}</span>
              <svg
                className="workspace-caret"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>

            {menuOpen ? (
              <div className="workspace-user-menu" role="menu">
                <div className="workspace-user-menu-info">
                  <div className="workspace-user-menu-name">{displayName}</div>
                  <div className="workspace-user-menu-email">{me?.email ?? ''}</div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-user-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenWorkspace();
                  }}
                >
                  工作台首页
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-user-menu-item"
                  onClick={() => { setMenuOpen(false); onLogout(); }}
                >
                  退出登录
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="workspace-content">{children}</main>
    </div>
  );
}
