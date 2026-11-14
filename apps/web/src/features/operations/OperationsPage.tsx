import { getMe } from '../auth/api/auth-api';
import type { AuthUser } from '../auth/types';
import { OperationsView, animateOperationsChange } from '@minicoze/ui/operations';
import { useEffect, useState, useLayoutEffect, type ComponentProps } from 'react';
import { AppLink } from '../../shared/routing/AppLink';
import { navigate, useRouteLocation } from '../../shared/routing/navigation';
import { createOperationsMock } from './operations.mock';

const mockData = createOperationsMock();
const scrollPositions = new Map<string, number>();

function OperationsLink({ to, onClick, ...props }: ComponentProps<typeof AppLink>) {
  return <AppLink {...props} to={to} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = new URL(to, window.location.href);
    // 会话链路展开/收起已有连续布局动画，不叠加快照过渡。
    const sameConversation = target.pathname === window.location.pathname && target.pathname.includes('/conversations/');
    if (sameConversation && target.searchParams.get('node') === new URLSearchParams(window.location.search).get('node')) return;
    event.preventDefault();
    animateOperationsChange(() => navigate(to));
  }} />;
}

export function OperationsPage() {
  const [profile, setProfile] = useState<AuthUser>();
  const [profileError, setProfileError] = useState('');
  useEffect(() => {
    let active = true;
    getMe().then(user => { if (active) setProfile(user); }).catch(() => {
      if (active) setProfileError('用户信息加载失败');
    });
    return () => { active = false; };
  }, []);
  const location = useRouteLocation();
  const [pathname, search = ''] = location.split('?');
  useLayoutEffect(() => {
    // 工作区使用独立滚动容器，进入详情回到顶部，返回列表恢复阅读位置。
    const scroller = document.querySelector<HTMLElement>('.workspace-content');
    if (!scroller) return;
    scroller.scrollTop = scrollPositions.get(pathname) ?? 0;
    const remember = () => scrollPositions.set(pathname, scroller.scrollTop);
    scroller.addEventListener('scroll', remember, { passive: true });
    return () => scroller.removeEventListener('scroll', remember);
  }, [pathname]);
  return (
    <OperationsView
      key={pathname}
      data={mockData}
      profile={profile}
      profileError={profileError}
      pathname={pathname}
      search={search}
      LinkComponent={OperationsLink}
    />
  );
}
