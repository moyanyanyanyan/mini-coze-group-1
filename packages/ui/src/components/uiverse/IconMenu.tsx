import type { ReactNode } from 'react';
import './IconMenu.css';

export interface IconMenuProps {
  label: string;
  items: { id: string; label: string; icon?: ReactNode; disabled?: boolean }[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function IconMenu({ label, items, selectedId, onSelect }: IconMenuProps) {
  return <div className="uv-icon-menu" role="group" aria-label={label}>
    {items.map(item => <button type="button" className="uv-icon-menu-value" key={item.id} disabled={item.disabled} aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)}>
      {item.icon && <span aria-hidden="true">{item.icon}</span>}{item.label}
    </button>)}
  </div>;
}
