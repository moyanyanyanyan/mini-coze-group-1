import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// API 密钥模块共用的弹窗交互。

interface ApiKeyDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  canDismiss?: boolean;
  showClose?: boolean;
  busy?: boolean;
  alert?: boolean;
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function ApiKeyDialog({
  open,
  title,
  children,
  footer,
  onClose,
  canDismiss = true,
  showClose = true,
  busy = false,
  alert = false,
  className = '',
}: ApiKeyDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const canDismissRef = useRef(canDismiss);
  onCloseRef.current = onClose;
  canDismissRef.current = canDismiss;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')
        ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      firstFocusable?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canDismissRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="api-key-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && canDismiss) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className={`api-key-dialog ${className}`.trim()}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
      >
        <header className="api-key-dialog__header">
          <h2 id={titleId}>{title}</h2>
          {showClose ? (
            <button
              className="api-key-dialog__close"
              type="button"
              aria-label="关闭弹窗"
              disabled={!canDismiss}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </header>
        <div className="api-key-dialog__body">{children}</div>
        {footer ? <footer className="api-key-dialog__footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
