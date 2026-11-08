import { useEffect, useState } from 'react';
import { deleteAgent, listAgents, type Agent, type AgentStatus, type AgentListResponse } from './agent.api';

interface Props {
  onSelect: (agent: Agent) => void;
  onCreate: () => void;
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

export function AgentListView({ onSelect, onCreate }: Props) {
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]['value']>('ALL');

  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<AgentListResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setResult(null);
    setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (keyword) params.set('keyword', keyword);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    listAgents(params).then((data) => {
      if (!active) return;
      const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
      if (page > lastPage) setPage(lastPage);
      else setResult(data);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : '加载智能体列表失败');
    });
    return () => { active = false; };
  }, [keyword, statusFilter, page, revision]);

  const handleDelete = async (e: React.SyntheticEvent, agentId: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`确定要删除 "${name}" 吗？`)) return;
    try {
      await deleteAgent(agentId);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    }
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
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          />
          <div className="ab-status-tabs" role="tablist">
            {statusFilters.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={statusFilter === tab.value}
                className={`ab-status-tab${statusFilter === tab.value ? ' is-active' : ''}`}
                onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && <div role="alert">{error} <button onClick={() => setRevision((value) => value + 1)}>重试</button></div>}
      {!result && !error && <p role="status">正在加载智能体…</p>}
      {result && result.total > result.pageSize && (
        <nav aria-label="智能体分页">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button>
          <span> 第 {page} / {Math.ceil(result.total / result.pageSize)} 页 </span>
          <button disabled={page * result.pageSize >= result.total} onClick={() => setPage(page + 1)}>下一页</button>
        </nav>
      )}
      <div className="ab-card-grid">
        {result?.items.map((agent) => (
          <button
            key={agent.id}
            className="ab-card"
            onClick={() => onSelect(agent)}
            aria-label={`${agent.name}，${statusLabel[agent.status]}`}
          >
            <div className="ab-card-top">
              <div className="ab-avatar" aria-hidden="true">
                {agent.name.slice(0, 1)}
              </div>
              <span className={`ab-status-badge ${statusClass[agent.status]}`}>{statusLabel[agent.status]}</span>
            </div>

            <div className="ab-card-name">{agent.name}</div>
            {agent.description && <div className="ab-card-desc">{agent.description}</div>}

            <div className="ab-card-stats">
              <span>{agent.pluginBindings.length} 插件</span>
              <span>{agent.knowledgeBaseBindings.length} 知识库</span>
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
