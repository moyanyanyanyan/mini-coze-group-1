import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { workspaceNavigation } from '../../app/feature-registry';
import { getMe, logout } from '../../features/auth/api/auth-api';
import type { AuthUser } from '../../features/auth/types';
import { AppLink } from '../routing/AppLink';
import { navigate } from '../routing/navigation';
import { Icon } from '../ui/Icon';
import './workspace-layout.css';

interface WorkspaceLayoutProps {
  pathname: string;
  children: ReactNode;
}

export function WorkspaceLayout({ pathname, children }: WorkspaceLayoutProps) {
  // 底部头像区：me 为 null = 还没问到 / 问失败，显示「未登录」兜底
  const [me, setMe] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((user) => {
        if (alive) {
          setMe(user);
        }
      })
      .catch(() => {
        // cookie 过期等情况：不弹错，底部显示兜底文案
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await logout();
    } catch {
      // 后端就算没清掉也不拦着走，cookie 大不了 7 天后自然过期
    }
    navigate('/login');
  };

  // displayName 没填过就退回邮箱，再不行显示「未登录」
  const displayName = me ? me.displayName || me.email : '未登录';

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

        <div className="workspace-sidebar-footer">
          <div className="workspace-user" ref={menuRef}>
            <button
              type="button"
              className="workspace-user-trigger"
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
                    navigate('/workspace');
                  }}
                >
                  工作台首页
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-user-menu-item"
                  onClick={() => void handleLogout()}
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
