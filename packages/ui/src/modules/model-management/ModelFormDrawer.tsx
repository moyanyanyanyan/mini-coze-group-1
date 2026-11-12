import type { FormEvent } from 'react';
import { providerOptions, type ModelFormErrors, type ModelFormValues, type ModelProvider } from './types';

export interface ModelFormDrawerProps {
  mode: 'create' | 'edit';
  isDefault: boolean;
  values: ModelFormValues;
  errors: ModelFormErrors;
  submitting: boolean;
  submitError: string | null;
  onChange: <K extends keyof ModelFormValues>(field: K, value: ModelFormValues[K]) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

export function ModelFormDrawer({
  mode, isDefault, values, errors, submitting, submitError, onChange, onClose, onSubmit,
}: ModelFormDrawerProps) {
  const editing = mode === 'edit';

  return (
    <div
      className="mm-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? '编辑模型' : '新增模型'}
      onClick={onClose}
    >
      <aside className="mm-drawer" onClick={(event) => { event.stopPropagation(); }}>
        <header className="mm-drawer-header">
          <div>
            <h3 className="mm-drawer-title">{editing ? '编辑模型' : '新增模型'}</h3>
            <p className="mm-drawer-subtitle">模型标识创建后不可修改，修改配置后立即影响智能体切换。</p>
          </div>
          <button className="mm-drawer-close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <form className="mm-form" onSubmit={onSubmit}>
          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-field-displayName">
              显示名称 <span className="mm-required">*</span>
            </label>
            <input
              id="mm-field-displayName"
              className={`mm-input${errors.displayName ? ' is-invalid' : ''}`}
              type="text"
              maxLength={50}
              value={values.displayName}
              placeholder="DeepSeek V4.1 Flash"
              onChange={(event) => { onChange('displayName', event.target.value); }}
              autoFocus
            />
            {errors.displayName
              ? <span className="mm-field-error">{errors.displayName}</span>
              : <span className="mm-field-hint">{values.displayName.length}/50</span>}
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-field-key">
              模型标识 <span className="mm-required">*</span>
            </label>
            <input
              id="mm-field-key"
              className={`mm-input${errors.key ? ' is-invalid' : ''}`}
              type="text"
              maxLength={100}
              value={values.key}
              placeholder="deepseek-ai/DeepSeek-V4.1-Flash"
              disabled={editing}
              onChange={(event) => { onChange('key', event.target.value); }}
            />
            {errors.key
              ? <span className="mm-field-error">{errors.key}</span>
              : <span className="mm-field-hint">{editing ? '模型标识创建后不可修改' : '支持字母、数字与 . _ : / -，最长 100 位'}</span>}
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-field-description">描述（可选）</label>
            <textarea
              id="mm-field-description"
              className={`mm-textarea${errors.description ? ' is-invalid' : ''}`}
              maxLength={200}
              rows={2}
              value={values.description}
              placeholder="用于列表副标题说明"
              onChange={(event) => { onChange('description', event.target.value); }}
            />
            {errors.description
              ? <span className="mm-field-error">{errors.description}</span>
              : <span className="mm-field-hint">{values.description.length}/200</span>}
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-field-provider">供应商 <span className="mm-required">*</span></label>
            <select
              id="mm-field-provider"
              className={`mm-input${errors.provider ? ' is-invalid' : ''}`}
              value={values.provider}
              onChange={(event) => { onChange('provider', event.target.value as ModelProvider); }}
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {errors.provider ? <span className="mm-field-error">{errors.provider}</span> : null}
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-field-upstreamModel">
              上游模型 ID <span className="mm-required">*</span>
            </label>
            <input
              id="mm-field-upstreamModel"
              className={`mm-input${errors.upstreamModel ? ' is-invalid' : ''}`}
              type="text"
              maxLength={100}
              value={values.upstreamModel}
              placeholder="deepseek-ai/DeepSeek-V4.1-Flash"
              onChange={(event) => { onChange('upstreamModel', event.target.value); }}
            />
            {errors.upstreamModel
              ? <span className="mm-field-error">{errors.upstreamModel}</span>
              : <span className="mm-field-hint">真正传给供应商的模型 ID，最长 100 位</span>}
          </div>

          <div className="mm-field-grid">
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-field-contextWindow">上下文窗口</label>
              <input
                id="mm-field-contextWindow"
                className={`mm-input${errors.contextWindow ? ' is-invalid' : ''}`}
                type="number"
                min={1024}
                max={1048576}
                value={values.contextWindow}
                onChange={(event) => { onChange('contextWindow', event.target.value); }}
              />
              {errors.contextWindow
                ? <span className="mm-field-error">{errors.contextWindow}</span>
                : <span className="mm-field-hint">1024-1048576</span>}
            </div>

            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-field-maxOutputTokens">最大输出</label>
              <input
                id="mm-field-maxOutputTokens"
                className={`mm-input${errors.maxOutputTokens ? ' is-invalid' : ''}`}
                type="number"
                min={1}
                max={8192}
                value={values.maxOutputTokens}
                onChange={(event) => { onChange('maxOutputTokens', event.target.value); }}
              />
              {errors.maxOutputTokens
                ? <span className="mm-field-error">{errors.maxOutputTokens}</span>
                : <span className="mm-field-hint">1-8192 tokens</span>}
            </div>
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-field-sortOrder">排序</label>
            <input
              id="mm-field-sortOrder"
              className={`mm-input${errors.sortOrder ? ' is-invalid' : ''}`}
              type="number"
              min={0}
              max={100000}
              value={values.sortOrder}
              onChange={(event) => { onChange('sortOrder', event.target.value); }}
            />
            {errors.sortOrder
              ? <span className="mm-field-error">{errors.sortOrder}</span>
              : <span className="mm-field-hint">数字越小越靠前</span>}
          </div>

          <div className="mm-switch-row">
            <label className="mm-checkbox">
              <input
                type="checkbox"
                checked={values.supportsVision}
                onChange={(event) => { onChange('supportsVision', event.target.checked); }}
              />
              支持图片输入
            </label>
            <label className="mm-checkbox">
              <input
                type="checkbox"
                checked={values.enabled}
                disabled={isDefault || submitting}
                onChange={(event) => { onChange('enabled', event.target.checked); }}
              />
              启用该模型
            </label>
          </div>
          {isDefault ? <span className="mm-field-hint">默认模型不可停用，如需停用请先切换默认模型。</span> : null}
          {errors.enabled ? <span className="mm-field-error">{errors.enabled}</span> : null}

          {submitError && <div className="mm-error" role="alert">{submitError}</div>}

          <footer className="mm-drawer-footer">
            <button type="button" className="mm-btn mm-btn-ghost" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="mm-btn mm-btn-primary" disabled={submitting}>
              {submitting ? '保存中…' : '保存'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
