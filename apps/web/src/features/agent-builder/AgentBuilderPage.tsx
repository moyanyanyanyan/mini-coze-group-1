import { useCallback, useEffect, useState } from 'react';
import { AgentListView } from './AgentListView';
import { CreateAgentModal } from './CreateAgentModal';
import { AgentDetailView } from './AgentDetailView';
import {
  createAgent,
  deleteAgent,
  listAgents,
  listKnowledgeBases,
  listPlugins,
  replaceKnowledgeBindings,
  replacePluginBindings,
  updateAgent,
  type Agent,
  type AgentStatus,
  type KnowledgeBaseSummary,
  type PluginSummary,
  type UpdateAgentInput,
} from './agent.api';
import './agent-builder.css';

type View = { type: 'list' } | { type: 'detail'; agentId: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function AgentBuilderPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [view, setView] = useState<View>({ type: 'list' });
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeError, setKnowledgeError] = useState(false);
  const [pluginError, setPluginError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  const refreshAgents = useCallback(async () => {
    const res = await listAgents();
    setAgents(res.items);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshAgents();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载 Agent 列表失败');
      }
      try {
        setKnowledgeBases(await listKnowledgeBases());
      } catch {
        setKnowledgeError(true);
        // TODO: 知识库目录需 KnowledgeWorkspaceGuard 放行
      }
      try {
        setPlugins(await listPlugins());
      } catch {
        setPluginError(true);
        // TODO: 插件目录需插件模块推送
      }
      setLoading(false);
    })();
  }, [refreshAgents]);

  const selectedAgent =
    view.type === 'detail' ? agents.find((a) => a.id === view.agentId) ?? null : null;

  const handleCreate = async (data: { name: string; description: string }) => {
    try {
      const created = await createAgent(data);
      setAgents((list) => [created, ...list]);
      setCreateOpen(false);
      setError(null);
      setView({ type: 'detail', agentId: created.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建 Agent 失败');
    }
  };

  const handleSave = async (agentId: string, updates: UpdateAgentInput) => {
    setSaveState('saving');
    setSaveMessage('保存中…');
    try {
      const saved = await updateAgent(agentId, updates);
      setAgents((list) => list.map((a) => (a.id === agentId ? saved : a)));
      setSaveState('saved');
      setSaveMessage('已保存');
      setError(null);
      window.setTimeout(() => {
        setSaveState('idle');
        setSaveMessage('');
      }, 2200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setSaveState('error');
      setSaveMessage(msg);
      setError(msg);
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId);
      setAgents((list) => list.filter((a) => a.id !== agentId));
      if (view.type === 'detail' && view.agentId === agentId) setView({ type: 'list' });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleStatusTransition = async (agentId: string, nextStatus: AgentStatus) => {
    const verb = nextStatus === 'ACTIVE' ? '发布' : '撤回为草稿';
    if (!window.confirm(`确定要${verb}吗？`)) return;

    setSaveState('saving');
    setSaveMessage(`${verb}中…`);
    try {
      const saved = await updateAgent(agentId, { status: nextStatus });
      setAgents((list) => list.map((a) => (a.id === agentId ? saved : a)));
      setSaveState('saved');
      setSaveMessage(`已${verb}`);
      setError(null);
      window.setTimeout(() => {
        setSaveState('idle');
        setSaveMessage('');
      }, 2200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '状态变更失败';
      setSaveState('error');
      setSaveMessage(msg);
      setError(msg);
    }
  };

  const handleUpdateKnowledgeBindings = async (
    agentId: string,
    knowledgeBaseIds: string[],
  ) => {
    try {
      await replaceKnowledgeBindings(agentId, { knowledgeBaseIds });
      await refreshAgents();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新知识库绑定失败');
    }
  };

  const handleUpdatePluginBindings = async (agentId: string, pluginIds: string[]) => {
    try {
      await replacePluginBindings(agentId, { pluginIds });
      await refreshAgents();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新插件绑定失败');
    }
  };

  return (
    <section className="feature-page agent-builder" aria-label="智能体创建">
      {error && <div className="agent-builder__error">{error}</div>}
      {loading ? (
        <div className="agent-builder__loading">加载中...</div>
      ) : (
        <>
          {view.type === 'list' && (
            <AgentListView
              agents={agents}
              onSelect={(agentId) => setView({ type: 'detail', agentId })}
              onCreate={() => setCreateOpen(true)}
              onDelete={handleDelete}
            />
          )}

          {view.type === 'detail' && selectedAgent && (
            <AgentDetailView
              agent={selectedAgent}
              knowledgeBases={knowledgeBases}
              plugins={plugins}
              saveState={saveState}
              saveMessage={saveMessage}
              onBack={() => setView({ type: 'list' })}
              onSave={(updates) => handleSave(selectedAgent.id, updates)}
              onStatusTransition={(next) => handleStatusTransition(selectedAgent.id, next)}
              onUpdateKnowledgeBindings={(ids) => handleUpdateKnowledgeBindings(selectedAgent.id, ids)}
              onUpdatePluginBindings={(ids) => handleUpdatePluginBindings(selectedAgent.id, ids)}
            />
          )}

          {knowledgeError && (
            <div className="agent-builder__note">知识库目录暂时不可用</div>
          )}
          {pluginError && (
            <div className="agent-builder__note">插件目录暂时不可用</div>
          )}

          {createOpen && (
            <CreateAgentModal
              onClose={() => setCreateOpen(false)}
              onSubmit={handleCreate}
            />
          )}
        </>
      )}
    </section>
  );
}
