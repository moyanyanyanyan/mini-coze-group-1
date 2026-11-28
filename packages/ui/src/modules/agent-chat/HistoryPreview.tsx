import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components';
import styles from './agent-chat.module.css';

const PreviewContext = createContext<{
  activeId: string | null;
  request: (id: string, delay?: number) => void;
  leave: (id: string) => void;
  keep: () => void;
  dismiss: () => void;
} | null>(null);

export function HistoryPreviewScope({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestedId = useRef<string | null>(null);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    requestedId.current = null;
    setActiveId(null);
  }, []);
  const controller = useMemo(() => ({
    activeId, dismiss,
    request: (id: string, delay = 450) => {
      if (requestedId.current === id) return;
      clearTimeout(timer.current);
      requestedId.current = id;
      setActiveId(null);
      timer.current = setTimeout(() => setActiveId(id), delay);
    },
    leave: (id: string) => {
      if (requestedId.current !== id) return;
      clearTimeout(timer.current);
      requestedId.current = null;
      timer.current = setTimeout(() => setActiveId((current) => current === id ? null : current), 100);
    },
    keep: () => clearTimeout(timer.current),
  }), [activeId, dismiss]);

  useEffect(() => {
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[role="tooltip"]')) dismiss();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    // 同一个列表只允许一个提示；滚动时连尚未触发的悬浮计时一起取消。
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('wheel', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', dismiss);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('wheel', onScroll, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('keydown', onKey);
    };
  }, [dismiss]);

  return <PreviewContext.Provider value={controller}>{children}</PreviewContext.Provider>;
}

interface HistoryPreviewProps {
  title: string;
  agentName?: string;
  createdAt?: string;
  updatedAt?: string;
  className?: string;
  children: ReactNode;
}

export function HistoryPreview({ title, agentName, createdAt, updatedAt, className, children }: HistoryPreviewProps) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const controller = useContext(PreviewContext);
  if (!controller) throw new Error('HistoryPreview 需要位于 HistoryPreviewScope 内');
  const { activeId, request, leave, keep, dismiss } = controller;
  const open = activeId === id;
  const [distance, setDistance] = useState(0);
  const [placement, setPlacement] = useState({ left: 0, top: 0 });
  const show = (delay?: number) => {
    const text = anchor.current?.querySelector<HTMLElement>('[data-history-title]');
    setDistance(text ? Math.max(0, text.scrollWidth - (text.parentElement?.clientWidth ?? 0)) : 0);
    request(id, delay);
  };
  useLayoutEffect(() => {
    if (!open || !anchor.current || !popup.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const { width, height } = popup.current.getBoundingClientRect();
    const beside = rect.right + 10 + width <= window.innerWidth - 12;
    setPlacement({
      left: beside ? rect.right + 10 : Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(beside ? rect.top : rect.bottom + 6, window.innerHeight - height - 12)),
    });
  }, [open, title]);

  return <div ref={anchor} className={className} data-preview-open={open || undefined}
    style={{ '--history-scroll': `${-distance}px`, '--history-duration': `${Math.max(3, distance / 28)}s` } as CSSProperties}
    onMouseEnter={() => show()} onMouseLeave={() => leave(id)}
    onPointerDown={dismiss}
    onFocus={(event) => { if (!(event.target as HTMLElement).closest('details, form')) show(0); }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) leave(id); }}
    aria-describedby={open ? id : undefined}>
    {children}
    {open && createPortal(<div ref={popup} id={id} role="tooltip" className={styles.historyPreview}
      style={placement} onMouseEnter={keep} onMouseLeave={dismiss}>
      <div className={styles.historyPreviewTitle}>{title}</div>
      {agentName && <div className={styles.historyPreviewAgent}><Icon name="bot" /><span>{agentName}</span></div>}
      {createdAt && <div className={styles.historyPreviewTime}>创建于 <time dateTime={createdAt}>{new Date(createdAt).toLocaleString('zh-CN')}</time></div>}
      {updatedAt && <div className={styles.historyPreviewTime}>更新于 <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleString('zh-CN')}</time></div>}
    </div>, document.body)}
  </div>;
}
