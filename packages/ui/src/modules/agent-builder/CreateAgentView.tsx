import type { FormEvent } from 'react';

export interface CreateAgentViewProps {
  name: string;
  description: string;
  error: string | null;
  canSubmit: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  handleSubmit: (event: FormEvent) => void;
}

export function CreateAgentView({
  name, description, error, canSubmit, onNameChange, onDescriptionChange, onClose, handleSubmit,
}: CreateAgentViewProps) {
  return (
    <div className="ab-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="新建智能体">
      <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ab-modal-header">
          <h3 className="ab-modal-title">新建智能体</h3>
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
              maxLength={50}
              value={name}
              onChange={(e) => {
                onNameChange(e.target.value);
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
              maxLength={200}
              value={description}
              onChange={(e) => {
                onDescriptionChange(e.target.value);
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
            <button type="submit" className="ab-btn ab-btn-primary" disabled={!canSubmit}>
              创建智能体
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
