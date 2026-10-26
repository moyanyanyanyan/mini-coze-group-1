import { useMemo, useState } from 'react';
import type { MockAgent } from './mockData';

interface Props {
  agents: MockAgent[];
  onSelect: (agentId: string) => void;
  onCreate: () => void;
  onDelete: (agentId: string) => void;
}

const statusFilters: Array<{ value: 'ALL' | MockAgent['status']; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '已发布' },
  { value: 'ARCHIVED', label: '已归档' },
];

const statusLabel: Record<MockAgent['status'], string> = {
  DRAFT: '草稿',
  ACTIVE: '已发布',
  ARCHIVED: '已归档',
};

const statusClass: Record<MockAgent['status'], string> = {
  DRAFT: 'status-draft',
  ACTIVE: 'status-active',
  ARCHIVED: 'status-archived',
};

export function AgentListView({ agents, onSelect, onCreate, onDelete }: Props) {
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]['value']>('ALL');

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (keyword && !a.name.toLowerCase().includes(keyword.toLowerCase()) && !a.description.toLowerCase().includes(keyword.toLowerCase()))
        return false;
      return true;
    });
  }, [agents, keyword, statusFilter]);

  const handleDelete = (e: React.MouseEvent, agentId: string, name: string) => {
    e.stopPropagation();
    if (confirm(`确定要删除 "${name}" 吗？此操作将软删除 Agent。`)) {
      onDelete(agentId);
    }
  };

  return (
    <div className="ab-list">
      <header className="ab-list-header">
        <div className="ab-list-title-row">
          <h2 className="ab-list-title">Agent 列表</h2>
          <button className="ab-btn ab-btn-primary" onClick={onCreate}>
            新建 Agent
          </button>
        </div>

        <div className="ab-list-controls">
          <input
            className="ab-search"
            type="search"
            placeholder="搜索 Agent 名称或描述"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className="ab-status-tabs" role="tablist">
            {statusFilters.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={statusFilter === tab.value}
                className={`ab-status-tab${statusFilter === tab.value ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="ab-card-grid">
        {filtered.map((agent) => (
          <button
            key={agent.id}
            className="ab-card"
            onClick={() => onSelect(agent.id)}
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
                  if (e.key === 'Enter' || e.key === ' ') handleDelete(e as unknown as React.MouseEvent, agent.id, agent.name);
                }}
              >
                删除
              </span>
            </div>
          </button>
        ))}

        <button className="ab-card ab-card-create" onClick={onCreate} aria-label="新建 Agent">
          <div className="ab-card-create-plus" aria-hidden="true">+</div>
          <div className="ab-card-create-label">新建 Agent</div>
        </button>

        {filtered.length === 0 && (
          <div className="ab-empty">没有找到匹配的 Agent</div>
        )}
      </div>
    </div>
  );
}
