import { useEffect, useState, type ReactNode } from 'react';
import { WorkspaceLayoutView } from '@minicoze/ui/layouts';
import { workspaceNavigation } from '../../app/feature-registry';
import { getMe, logout } from '../../features/auth/api/auth-api';
import type { AuthUser } from '../../features/auth/types';
import { ApiError } from '../api/http';
import { AppLink } from '../routing/AppLink';
import { navigate } from '../routing/navigation';

export function WorkspaceLayout({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((user) => {
        if (alive) {
          setMe(user);
        }
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          navigate('/login');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // 后端就算没清掉也不拦着走，cookie 大不了 7 天后自然过期
    }
    navigate('/login');
  };

  return (
    <WorkspaceLayoutView
      pathname={pathname}
      navigation={workspaceNavigation}
      user={me}
      LinkComponent={AppLink}
      onLogout={handleLogout}
      onOpenWorkspace={() => navigate('/workspace')}
    >
      {children}
    </WorkspaceLayoutView>
  );
}
