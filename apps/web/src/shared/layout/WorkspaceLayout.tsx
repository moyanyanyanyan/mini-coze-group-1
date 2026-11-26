import { useEffect, useState, type ReactNode } from 'react';
import { WorkspaceLayoutView } from '@minicoze/ui/layouts';
import { workspaceNavigation } from '../../app/feature-registry';
import { getMe, logout } from '../../features/auth/api/auth-api';
import { getCurrentUser, setCurrentUser, useCurrentUser } from '../user/current-user';
import { AppLink } from '../routing/AppLink';
import { navigate } from '../routing/navigation';

interface WorkspaceLayoutProps {
  pathname: string;
  children: ReactNode;
}

export function WorkspaceLayout({ pathname, children }: WorkspaceLayoutProps) {
  // 底部头像区：共享全局用户快照，个人中心改名/换头像后这里会同步刷新
  const me = useCurrentUser();

  useEffect(() => {
    if (getCurrentUser()) return;
    let alive = true;
    getMe()
      .then((user) => {
        if (alive) setCurrentUser(user);
      })
      .catch(() => {
        // cookie 过期等情况：不弹错，底部显示兜底文案
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
      onLogout={() => void handleLogout()}
      onOpenWorkspace={() => navigate('/workspace')}
      menuItems={[
        { label: '个人中心', onClick: () => navigate('/workspace/profile') },
      ]}
    >
      {children}
    </WorkspaceLayoutView>
  );
}
