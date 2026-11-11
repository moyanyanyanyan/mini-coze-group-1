import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function ActionMenu({ label = '更多操作', children }: { label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <details className="ui-action-menu" ref={ref} onKeyDown={(event) => {
    if (event.key === 'Escape' && ref.current) {
      ref.current.open = false;
      ref.current.querySelector('summary')?.focus();
    }
  }}>
    <summary aria-label={label} title={label}><Icon name="more" /></summary>
    <div className="ui-menu-items" onClick={(event) => {
      if ((event.target as HTMLElement).closest('button') && ref.current) {
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    }}>{children}</div>
  </details>;
}
