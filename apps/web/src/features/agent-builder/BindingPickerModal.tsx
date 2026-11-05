import { useEffect, useState } from 'react';

export interface PickerItem {
  id: string;
  title: string;
  description?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  items: PickerItem[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
}

export function BindingPickerModal({
  title,
  subtitle,
  items,
  selectedIds,
  onConfirm,
  saving = false,
  error,
  onClose,
}: Props) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedIds));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const ordered = items.filter((it) => checked.has(it.id)).map((it) => it.id);
    onConfirm(ordered);
  };

  const isEmpty = items.length === 0;

  return (
    <div
      className="ab-modal-backdrop"
      onClick={() => { if (!saving) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="ab-modal ab-modal-picker" onClick={(e) => e.stopPropagation()}>
        <header className="ab-modal-header">
          <h3 className="ab-modal-title">{title}</h3>
          <button className="ab-modal-close" onClick={() => { if (!saving) onClose(); }} aria-label="关闭" disabled={saving}>
            ×
          </button>
        </header>

        <div className="ab-modal-body">
          {error && <p role="alert">{error}</p>}
          {subtitle && <p className="ab-modal-subtitle">{subtitle}</p>}

          {isEmpty ? (
            <div className="ab-picker-empty">目录暂无可用项</div>
          ) : (
            <ul className="ab-picker-list">
              {items.map((item) => {
                const isChecked = checked.has(item.id);
                return (
                  <li key={item.id} className="ab-picker-item">
                    <label className="ab-picker-label">
                      <input
                        type="checkbox"
                        className="ab-picker-checkbox"
                        disabled={saving}
                        checked={isChecked}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="ab-picker-checkbox-fake" aria-hidden />
                      <div className="ab-picker-text">
                        <div className="ab-picker-title">{item.title}</div>
                        {item.description && (
                          <div className="ab-picker-desc">{item.description}</div>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="ab-modal-footer">
          <button type="button" className="ab-btn ab-btn-ghost" disabled={saving} onClick={() => { if (!saving) onClose(); }}>
            取消
          </button>
          <button
            type="button"
            className="ab-btn ab-btn-primary"
            onClick={handleConfirm}
            disabled={isEmpty || saving}
          >
            {saving ? '保存中…' : `确定 (${checked.size})`}
          </button>
        </footer>
      </div>
    </div>
  );
}
