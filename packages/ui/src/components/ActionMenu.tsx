import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

type ActionMenuProps = {
  label?: string;
  children: ReactNode;
  /**
   * 浮层模式：菜单通过 portal 渲染到 body 并用 fixed 定位，
   * 避免被表格等 overflow 容器裁切，也不会撑开容器造成空白。
   */
  floating?: boolean;
};

export function ActionMenu({ label = '更多操作', children, floating = false }: ActionMenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const sync = () => setOpen(element.open);
    element.addEventListener('toggle', sync);
    return () => element.removeEventListener('toggle', sync);
  }, []);

  useLayoutEffect(() => {
    if (!floating || !open) {
      setPlacement(null);
      return;
    }
    const summary = ref.current?.querySelector('summary');
    const menu = menuRef.current;
    if (!summary || !menu) {
      return;
    }
    const rect = summary.getBoundingClientRect();
    const height = menu.offsetHeight;
    const openUp = rect.bottom + height + 8 > window.innerHeight && rect.top - height - 6 > 8;
    setPlacement({
      top: Math.round(openUp ? rect.top - height - 6 : rect.bottom + 6),
      right: Math.round(Math.max(8, window.innerWidth - rect.right)),
    });
  }, [floating, open]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      if (ref.current) {
        ref.current.open = false;
      }
    };
    const closeOnScroll = () => {
      if (floating && ref.current?.open) {
        ref.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    if (floating) {
      window.addEventListener('scroll', closeOnScroll, true);
      window.addEventListener('resize', closeOnScroll);
    }
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
      if (floating) {
        window.removeEventListener('scroll', closeOnScroll, true);
        window.removeEventListener('resize', closeOnScroll);
      }
    };
  }, [floating]);

  const menu = (
    <div
      ref={floating ? menuRef : undefined}
      className="ui-menu-items"
      style={
        floating
          ? placement
            ? { position: 'fixed', top: placement.top, right: placement.right }
            : { position: 'fixed', top: 0, right: 0, visibility: 'hidden' }
          : undefined
      }
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button') && ref.current) {
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      {children}
    </div>
  );

  return (
    <details
      className="ui-action-menu"
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && ref.current) {
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label={label} title={label}>
        <Icon name="more" />
      </summary>
      {floating ? (open ? createPortal(menu, document.body) : null) : menu}
    </details>
  );
}
