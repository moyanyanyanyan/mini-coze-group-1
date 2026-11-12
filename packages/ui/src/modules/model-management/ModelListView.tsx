import { providerLabels, type ModelListItem } from './types';

export interface ModelListViewProps {
  items: ModelListItem[] | null;
  error: string;
  includeDisabled: boolean;
  busyKey: string | null;
  onToggleIncludeDisabled: (value: boolean) => void;
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (item: ModelListItem) => void;
  onSetDefault: (item: ModelListItem) => void;
  onToggleEnabled: (item: ModelListItem) => void;
  onDelete: (item: ModelListItem) => void;
}

export function formatContextWindow(value: number): string {
  if (value >= 1048576) {
    return `${Math.round((value / 1048576) * 10) / 10}M`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)}K`;
  }
  return String(value);
}

interface ModelRowProps {
  item: ModelListItem;
  busy: boolean;
  onEdit: (item: ModelListItem) => void;
  onSetDefault: (item: ModelListItem) => void;
  onToggleEnabled: (item: ModelListItem) => void;
  onDelete: (item: ModelListItem) => void;
}

function ModelRow({ item, busy, onEdit, onSetDefault, onToggleEnabled, onDelete }: ModelRowProps) {
  const defaultLocked = item.enabled && item.isDefault;

  return (
    <article
      className={`mm-row${item.enabled ? '' : ' is-disabled'}`}
      aria-label={`${item.displayName}，${item.isDefault ? '默认模型，' : ''}${item.enabled ? '已启用' : '已停用'}`}
    >
      <div className="mm-row-main">
        <div className="mm-row-title">
          <span className="mm-row-name">{item.displayName}</span>
          {item.isDefault && <span className="mm-badge mm-badge-default">默认</span>}
          <span className={`mm-badge ${item.enabled ? 'mm-badge-enabled' : 'mm-badge-disabled'}`}>
            {item.enabled ? '已启用' : '已停用'}
          </span>
        </div>

        <code className="mm-row-key">{item.key}</code>
        {item.description ? <p className="mm-row-desc">{item.description}</p> : null}

        <div className="mm-row-meta">
          <span>供应商：{providerLabels[item.provider]}</span>
          <span>上游模型：{item.upstreamModel}</span>
          <span>上下文：{formatContextWindow(item.contextWindow)}</span>
          <span>最大输出：{item.maxOutputTokens} tokens</span>
          <span>引用：{item.usageCount}</span>
        </div>

        <div className="mm-row-tags">
          <span className="mm-tag">文本</span>
          {item.supportsVision ? <span className="mm-tag mm-tag-vision">图片</span> : null}
        </div>
      </div>

      <div className="mm-row-actions">
        <button className="mm-link" onClick={() => onEdit(item)} disabled={busy}>编辑</button>
        {!item.isDefault && (
          <button
            className="mm-link"
            disabled={busy || !item.enabled}
            title={item.enabled ? undefined : '停用的模型不能设为默认'}
            onClick={() => onSetDefault(item)}
          >
            设为默认
          </button>
        )}
        <button
          className="mm-link"
          disabled={busy || defaultLocked}
          title={defaultLocked ? '默认模型不可停用，请先切换默认模型' : undefined}
          onClick={() => onToggleEnabled(item)}
        >
          {item.enabled ? '停用' : '启用'}
        </button>
        {item.usageCount === 0 && !item.isDefault && (
          <button className="mm-link mm-link-danger" disabled={busy} onClick={() => onDelete(item)}>
            删除
          </button>
        )}
        {busy ? <span className="mm-row-busy">处理中…</span> : null}
      </div>
    </article>
  );
}

export function ModelListView({
  items, error, includeDisabled, busyKey,
  onToggleIncludeDisabled, onRetry, onCreate, onEdit, onSetDefault, onToggleEnabled, onDelete,
}: ModelListViewProps) {
  return (
    <div className="mm-list">
      <header className="mm-header">
        <div className="mm-header-text">
          <h2 className="mm-title">模型管理</h2>
          <p className="mm-subtitle">
            集中管理可用模型，智能体创建与运行都从这里读取。
            {items ? <span className="mm-count">共 {items.length} 个模型</span> : null}
          </p>
        </div>

        <div className="mm-header-actions">
          <label className="mm-switch">
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(event) => { onToggleIncludeDisabled(event.target.checked); }}
            />
            <span className="mm-switch-slider" aria-hidden="true" />
            <span className="mm-switch-label">显示已停用</span>
          </label>
          <button className="mm-btn mm-btn-primary" onClick={onCreate}>新增模型</button>
        </div>
      </header>

      {error && (
        <div className="mm-error" role="alert">
          <span>{error}</span>
          <button className="mm-link" onClick={onRetry}>重试</button>
        </div>
      )}

      {!error && items === null && <p className="mm-empty" role="status">正在加载模型…</p>}

      {items !== null && items.length === 0 && (
        <div className="mm-empty">
          {includeDisabled ? '还没有任何模型，请先新增模型' : '暂无启用中的模型，可打开"显示已停用"查看或新增模型'}
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="mm-rows">
          {items.map((item) => (
            <ModelRow
              key={item.key}
              item={item}
              busy={busyKey === item.key}
              onEdit={onEdit}
              onSetDefault={onSetDefault}
              onToggleEnabled={onToggleEnabled}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
