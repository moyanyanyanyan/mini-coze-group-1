import { useEffect, useState } from 'react';
import { AgentListView } from '@minicoze/ui/agent-builder';
import { deleteAgent, listAgents, type Agent, type AgentStatus, type AgentListResponse } from './agent.api';

interface Props {
  onSelect: (agent: Agent) => void;
  onCreate: () => void;
}

export function AgentListController({ onSelect, onCreate }: Props) {
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AgentStatus>('ALL');

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

  const handleDelete = async (agentId: string, name: string) => {
    if (!confirm(`确定要删除 "${name}" 吗？`)) return;
    try {
      await deleteAgent(agentId);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    }
  };

  return (
    <AgentListView
      keyword={keyword}
      statusFilter={statusFilter}
      page={page}
      result={result && {
        ...result,
        items: result.items.map((agent) => ({
          id: agent.id, name: agent.name, description: agent.description, status: agent.status,
          pluginCount: agent.pluginBindings.length, knowledgeBaseCount: agent.knowledgeBaseBindings.length,
        })),
      }}
      error={error}
      onKeywordChange={(value) => { setKeyword(value); setPage(1); }}
      onStatusChange={(value) => { setStatusFilter(value); setPage(1); }}
      onPageChange={setPage}
      onRetry={() => setRevision((value) => value + 1)}
      onSelect={(id) => {
        const agent = result?.items.find((item) => item.id === id);
        if (agent) onSelect(agent);
      }}
      onCreate={onCreate}
      onDelete={handleDelete}
    />
  );
}
