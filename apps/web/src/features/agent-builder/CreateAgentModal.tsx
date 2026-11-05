import { useState } from 'react';

interface Props {
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => void;
}

export function CreateAgentModal({ onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请填写 Agent 名称');
      return;
    }
    if (name.length > 50) {
      setError('名称不能超过 50 字');
      return;
    }
    if (description.length > 200) {
      setError('描述不能超过 200 字');
      return;
    }
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="ab-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="新建 Agent">
      <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ab-modal-header">
          <h3 className="ab-modal-title">新建 Agent</h3>
          <button className="ab-modal-close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="ab-field">
            <label htmlFor="ab-create-name" className="ab-label">
              名称 <span className="ab-required">*</span>
            </label>
            <input
              id="ab-create-name"
              className="ab-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="客服助手"
              autoFocus
            />
            <span className="ab-field-hint">{name.length}/50</span>
          </div>

          <div className="ab-field">
            <label htmlFor="ab-create-desc" className="ab-label">描述（可选）</label>
            <textarea
              id="ab-create-desc"
              className="ab-textarea"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError(null);
              }}
              placeholder="自动回复常见问题"
              rows={3}
            />
            <span className="ab-field-hint">{description.length}/200</span>
          </div>

          {error && <div className="ab-error">{error}</div>}

          <footer className="ab-modal-footer">
            <button type="button" className="ab-btn ab-btn-ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="ab-btn ab-btn-primary" disabled={!name.trim()}>
              确定
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
