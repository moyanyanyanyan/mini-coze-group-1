import { createPortal } from 'react-dom';
import type { Notice } from '../hooks/use-notice';
import './notice-toast.css';

interface NoticeToastProps {
  notice: Notice | null;
}

export function NoticeToast({ notice }: NoticeToastProps) {
  if (!notice) {
    return null;
  }

  return createPortal(
    <div
      className={`app-notice app-notice--${notice.type}`}
      key={notice.id}
      role={notice.type === 'error' ? 'alert' : 'status'}
      aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
    >
      {notice.message}
    </div>,
    document.body,
  );
}
