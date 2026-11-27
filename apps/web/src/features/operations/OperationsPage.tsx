import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { OperationsView, OperationsLoader, animateOperationsChange, type OperationsData } from '@minicoze/ui/operations';
import { getMe } from '../auth/api/auth-api';
import type { AuthUser } from '../auth/types';
import { AppLink } from '../../shared/routing/AppLink';
import { navigate, useRouteLocation } from '../../shared/routing/navigation';
import { ApiError } from '../../shared/api/http';
import { loadOperations } from './operations.api';

const scrollPositions = new Map<string, number>();
function OperationsLink({ to, onClick, ...props }: ComponentProps<typeof AppLink>) {
  return <AppLink {...props} to={to} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = new URL(to, window.location.href);
    if (target.pathname === window.location.pathname && target.pathname.includes('/conversations/') && target.searchParams.get('node') === new URLSearchParams(window.location.search).get('node')) return;
    event.preventDefault(); animateOperationsChange(() => navigate(to));
  }} />;
}

export function OperationsPage() {
  const location = useRouteLocation();
  const [pathname, search = ''] = location.split('?');
  return <OperationsController key={pathname} pathname={pathname} search={search} />;
}

function OperationsController({ pathname, search }: { pathname: string; search: string }) {
  const [profile, setProfile] = useState<AuthUser>();
  const [data, setData] = useState<OperationsData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [runPages, setRunPages] = useState(1);
  const restored = useRef(false);
  useEffect(() => {
    let active = true;
    let pending = false;
    let polling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (pending || !active) return;
      pending = true; setLoading(true);
      try {
        const user = await getMe();
        const next = await loadOperations(pathname, search, user.id, runPages);
        if (!active) return;
        setProfile(user); setData(next); setError('');
        polling = next.runs.some(run => run.observed && (run.observed.status === 'running' || (run.status === 'running' && run.observed.finishedAt !== null && Date.now() - Date.parse(run.observed.finishedAt) < 30_000))) || next.tasks.some(task => task.observed && task.status === 'processing');
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) { setData(undefined); navigate('/login'); }
        else {
          if (failure instanceof ApiError && [403, 404].includes(failure.status)) { setData(undefined); polling = false; }
          setError(failure instanceof Error ? failure.message : '读取失败，请重试');
        }
      } finally {
        pending = false;
        if (active) {
          setLoading(false);
          if (!document.hidden) timer = setTimeout(() => void refresh(), polling ? 5000 : 30_000);
        }
      }
    }
    void refresh();
    const visibility = () => { clearTimeout(timer); if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', visibility);
    return () => { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', visibility); };
  }, [pathname, search, attempt, runPages]);
  useLayoutEffect(() => {
    if (!data || restored.current) return;
    const scroller = document.querySelector<HTMLElement>('.workspace-content');
    if (scroller) scroller.scrollTop = scrollPositions.get(pathname) ?? 0;
    restored.current = true;
  }, [data, pathname]);
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('.workspace-content');
    const remember = () => { if (restored.current && scroller) scrollPositions.set(pathname, scroller.scrollTop); };
    scroller?.addEventListener('scroll', remember, { passive: true });
    return () => scroller?.removeEventListener('scroll', remember);
  }, [pathname]);
  if (!data) return <div className="om">{error
    ? <div className="om-empty" role="alert">{error}<button onClick={() => setAttempt(n => n + 1)}>重试</button></div>
    : <div className="om-loading" role="status"><OperationsLoader /><span>正在加载运行数据…</span></div>}
  </div>;
  return <OperationsView data={data} profile={profile} pathname={pathname} search={search} LinkComponent={OperationsLink}
    loading={loading} error={error} onRefresh={() => setAttempt(n => n + 1)} onMoreRuns={() => setRunPages(n => n + 1)} />;
}
