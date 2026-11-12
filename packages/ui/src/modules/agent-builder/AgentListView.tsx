import type { SyntheticEvent } from 'react';
import type { AgentStatus, AgentListItem } from './types';

export interface AgentListViewProps {
  keyword: string;
  statusFilter: 'ALL' | AgentStatus;
  page: number;
  result: { items: AgentListItem[]; total: number; pageSize: number } | null;
  error: string;
  onKeywordChange: (value: string) => void;
  onStatusChange: (value: 'ALL' | AgentStatus) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string, name: string) => void;
}

const statusFilters: Array<{ value: 'ALL' | AgentStatus; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '已发布' },
];

const statusLabel: Record<AgentStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '已发布',
  ARCHIVED: '已归档',
};

const statusClass: Record<AgentStatus, string> = {
  DRAFT: 'status-draft',
  ACTIVE: 'status-active',
  ARCHIVED: 'status-archived',
};

export function AgentListView({
  keyword, statusFilter, page, result, error, onKeywordChange, onStatusChange,
  onPageChange, onRetry, onSelect, onCreate, onDelete,
}: AgentListViewProps) {
  const handleDelete = (event: SyntheticEvent, id: string, name: string) => {
    event.stopPropagation();
    onDelete(id, name);
  };

  return (
    <div className="ab-list">
      <header className="ab-list-header">
        <div className="ab-list-title-row">
          <h2 className="ab-list-title">智能体</h2>
          <button className="ab-btn ab-btn-primary" onClick={onCreate}>
            新建智能体
          </button>
        </div>

        <div className="ab-list-controls">
          <input
            className="ab-search"
            type="search"
            placeholder="搜索智能体名称或描述"
            value={keyword}
            onChange={(e) => { onKeywordChange(e.target.value); }}
          />
          <div className="ab-status-filter">
            <label className="ab-visually-hidden" htmlFor="ab-status-filter">按状态筛选</label>
            <select
              id="ab-status-filter"
              className="ab-status-select"
              value={statusFilter}
              onChange={(e) => { onStatusChange(e.target.value as 'ALL' | AgentStatus); }}
            >
              {statusFilters.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {error && <div role="alert">{error} <button onClick={() => onRetry()}>重试</button></div>}
      {!result && !error && <p role="status">正在加载智能体…</p>}
      {result && result.total > result.pageSize && (
        <nav aria-label="智能体分页">
          <button disabled={page === 1} onClick={() => onPageChange(page - 1)}>上一页</button>
          <span> 第 {page} / {Math.ceil(result.total / result.pageSize)} 页 </span>
          <button disabled={page * result.pageSize >= result.total} onClick={() => onPageChange(page + 1)}>下一页</button>
        </nav>
      )}
      <div className="ab-card-grid">
        {result?.items.map((agent) => (
          <button
            key={agent.id}
            className="ab-card"
            onClick={() => onSelect(agent.id)}
            aria-label={`${agent.name}，${statusLabel[agent.status]}`}
          >
            <div className="ab-card-head">
              <div className="ab-card-name" title={agent.name}>{agent.name}</div>
              <span className={`ab-status-badge ${statusClass[agent.status]}`}>{statusLabel[agent.status]}</span>
            </div>

            <div className={`ab-card-desc${agent.description ? '' : ' is-empty'}`}>
              {agent.description || '暂无描述'}
            </div>

            <div className="ab-card-stats">
              <span><strong>{agent.pluginCount}</strong> 插件</span>
              <span className="ab-card-stats-divider" aria-hidden="true" />
              <span><strong>{agent.knowledgeBaseCount}</strong> 知识库</span>
            </div>

            <div className="ab-card-actions">
              <span className="ab-card-link" aria-hidden="true">编辑</span>
              <span
                className="ab-card-delete"
                role="button"
                tabIndex={0}
                onClick={(e) => handleDelete(e, agent.id, agent.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleDelete(e, agent.id, agent.name);
                }}
              >
                删除
              </span>
            </div>
          </button>
        ))}

        <button className="ab-card ab-card-create" onClick={onCreate} aria-label="新建智能体">
          <div className="ab-card-create-plus" aria-hidden="true">+</div>
          <div className="ab-card-create-label">新建智能体</div>
        </button>

        {result?.items.length === 0 && (
          <div className="ab-empty">没有找到匹配的智能体</div>
        )}
      </div>
    </div>
  );
}
