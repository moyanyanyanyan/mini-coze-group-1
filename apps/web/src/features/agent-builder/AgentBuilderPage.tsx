import { useEffect, useState } from 'react';
import { AgentListView } from './AgentListView';
import { CreateAgentModal } from './CreateAgentModal';
import { AgentDetailView } from './AgentDetailView';
import {
  createAgent,
  getAgent,
  listKnowledgeBases,
  listPlugins,
  replaceKnowledgeBindings,
  replacePluginBindings,
  updateAgent,
  type Agent,
  type AgentStatus,
  type KnowledgeBaseSummary,
  type KnowledgeBindingItemInput,
  type PluginSummary,
  type UpdateAgentInput,
} from './agent.api';
import './agent-builder.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function AgentBuilderPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const target = new URLSearchParams(window.location.search).get('id');
  const [createOpen, setCreateOpen] = useState(() => new URLSearchParams(window.location.search).get('action') === 'new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeError, setKnowledgeError] = useState(false);
  const [pluginError, setPluginError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.allSettled([
        target ? getAgent(target) : Promise.resolve(null),
        listKnowledgeBases(),
        listPlugins(),
      ]);

      if (!active) return;
      const [agentsRes, kbRes, pluginsRes] = results;

      if (agentsRes.status === 'fulfilled') {
        setSelectedAgent(agentsRes.value);
        setError(null);
      } else {
        setError(
          agentsRes.reason instanceof Error
            ? agentsRes.reason.message
            : '加载智能体列表失败',
        );
      }

      if (kbRes.status === 'fulfilled') {
        setKnowledgeBases(kbRes.value);
      } else {
        setKnowledgeError(true);
      }

      if (pluginsRes.status === 'fulfilled') {
        setPlugins(pluginsRes.value);
      } else {
        setPluginError(true);
      }

      setLoading(false);
    })();
    return () => { active = false; };
  }, [target]);

  const handleCreate = async (data: { name: string; description: string }) => {
    try {
      const created = await createAgent(data);
      setSelectedAgent(created);
      setCreateOpen(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建智能体失败');
    }
  };

  const handleSave = async (agentId: string, updates: UpdateAgentInput) => {
    setSaveState('saving');
    setSaveMessage('保存中…');
    try {
      const saved = await updateAgent(agentId, updates);
      setSelectedAgent((current) => current?.id === agentId ? saved : current);
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

  const handleStatusTransition = async (agentId: string, nextStatus: AgentStatus, updates?: UpdateAgentInput) => {
    const verb = nextStatus === 'ACTIVE' ? '发布' : '撤回为草稿';
    if (!window.confirm(`确定要${verb}吗？`)) return;

    setSaveState('saving');
    setSaveMessage(`${verb}中…`);
    try {
      const saved = await updateAgent(agentId, { ...updates, status: nextStatus });
      setSelectedAgent((current) => current?.id === agentId ? saved : current);
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
    bindings: KnowledgeBindingItemInput[],
  ) => {
    try {
      const saved = await replaceKnowledgeBindings(agentId, { bindings });
      setSelectedAgent((current) => current?.id === agentId ? { ...current, knowledgeBaseBindings: saved } : current);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新知识库绑定失败');
    }
  };

  const handleUpdatePluginBindings = async (
    agentId: string,
    bindings: Array<{ pluginId: string; enabled: boolean }>,
  ) => {
    const saved = await replacePluginBindings(agentId, { bindings });
    setSelectedAgent((current) => current?.id === agentId ? { ...current, pluginBindings: saved } : current);
    setError(null);
  };

  return (
    <section className="feature-page agent-builder" aria-label="智能体创建">
      {error && <div className="agent-builder__error">{error}</div>}
      {loading ? (
        <div className="agent-builder__loading">加载中...</div>
      ) : (
        <>
          {!selectedAgent && (
            <AgentListView
              onSelect={setSelectedAgent}
              onCreate={() => setCreateOpen(true)}
            />
          )}

          {selectedAgent && (
            <AgentDetailView
              key={selectedAgent.id}
              agent={selectedAgent}
              knowledgeBases={knowledgeBases}
              plugins={plugins}
              saveState={saveState}
              saveMessage={saveMessage}
              onBack={() => setSelectedAgent(null)}
              onSave={(updates) => handleSave(selectedAgent.id, updates)}
              onStatusTransition={(next, updates) => handleStatusTransition(selectedAgent.id, next, updates)}
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
