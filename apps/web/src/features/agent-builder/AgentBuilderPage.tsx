import { useEffect, useState } from 'react';
import { AgentListController } from './AgentListController';
import { CreateAgentController } from './CreateAgentController';
import { AgentDetailController } from './AgentDetailController';
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
import { AgentBuilderView, type AgentModelOption } from '@minicoze/ui/agent-builder';
import { loadAgentModels } from './agentModels';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** 已发布 Agent 保存即生成新版本并生效；草稿只保存不生效。 */
function saveSuccessText(agent: Agent): string {
  if (agent.published && agent.configVersion !== undefined) {
    return `已保存并生效（版本 v${agent.configVersion}）`;
  }
  return '已保存；发布后生效';
}

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
  const [modelOptions, setModelOptions] = useState<AgentModelOption[]>([]);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.allSettled([
        target ? getAgent(target) : Promise.resolve(null),
        listKnowledgeBases(),
        listPlugins(),
        loadAgentModels(),
      ]);

      if (!active) return;
      const [agentsRes, kbRes, pluginsRes, modelsRes] = results;

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

      if (modelsRes.status === 'fulfilled') {
        setModelOptions(modelsRes.value.options);
        setModelNotice(modelsRes.value.error);
      }

      setLoading(false);
    })();
    return () => { active = false; };
  }, [target]);

  const handleCreate = async (data: {
    name: string;
    description: string;
    model: string;
    openingMessage: string;
  }) => {
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
      setSaveMessage(saveSuccessText(saved));
      setError(null);
      window.setTimeout(() => {
        setSaveState('idle');
        setSaveMessage('');
      }, 2200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setSaveState('error');
      setSaveMessage(`保存失败：${msg}`);
    }
  };

  const flashSaved = (message: string) => {
    setSaveState('saved');
    setSaveMessage(message);
    window.setTimeout(() => {
      setSaveState('idle');
      setSaveMessage('');
    }, 2200);
  };

  const handleStatusTransition = async (agentId: string, nextStatus: AgentStatus, updates?: UpdateAgentInput) => {
    const verb = nextStatus === 'ACTIVE' ? '发布' : '撤回为草稿';

    setSaveState('saving');
    setSaveMessage(`${verb}中…`);
    try {
      const saved = await updateAgent(agentId, { ...updates, status: nextStatus });
      setSelectedAgent((current) => current?.id === agentId ? saved : current);
      setError(null);
      if (nextStatus === 'ACTIVE') {
        flashSaved(saved.configVersion !== undefined
          ? `已发布并生效（版本 v${saved.configVersion}）`
          : '已发布并生效');
      } else {
        flashSaved('已撤回为草稿；修改需重新发布后生效');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setSaveState('error');
      setSaveMessage(`${verb}失败：${msg}`);
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
      flashSaved(selectedAgent?.status === 'ACTIVE'
        ? '知识库绑定已保存并生效'
        : '知识库绑定已保存；发布后生效');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(`更新知识库绑定失败：${msg}`);
      setSaveState('error');
      setSaveMessage(`知识库绑定保存失败：${msg}`);
    }
  };

  const handleUpdatePluginBindings = async (
    agentId: string,
    bindings: Array<{ pluginId: string; enabled: boolean }>,
  ) => {
    const saved = await replacePluginBindings(agentId, { bindings });
    setSelectedAgent((current) => current?.id === agentId ? { ...current, pluginBindings: saved } : current);
    setError(null);
    flashSaved(selectedAgent?.status === 'ACTIVE'
      ? '插件绑定已保存并生效'
      : '插件绑定已保存；发布后生效');
  };

  return (
    <AgentBuilderView
      loading={loading}
      error={error}
      knowledgeError={knowledgeError}
      pluginError={pluginError}
      createDialog={createOpen && (
        <CreateAgentController
          modelOptions={modelOptions}
          modelNotice={modelNotice}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    >
      {!selectedAgent && (
        <AgentListController
          onSelect={setSelectedAgent}
          onCreate={() => setCreateOpen(true)}
        />
      )}

      {selectedAgent && (
        <AgentDetailController
          key={selectedAgent.id}
          agent={selectedAgent}
          knowledgeBases={knowledgeBases}
          plugins={plugins}
          modelOptions={modelOptions}
          modelNotice={modelNotice}
          saveState={saveState}
          saveMessage={saveMessage}
          onBack={() => setSelectedAgent(null)}
          onSave={(updates) => handleSave(selectedAgent.id, updates)}
          onStatusTransition={(next, updates) => handleStatusTransition(selectedAgent.id, next, updates)}
          onUpdateKnowledgeBindings={(ids) => handleUpdateKnowledgeBindings(selectedAgent.id, ids)}
          onUpdatePluginBindings={(ids) => handleUpdatePluginBindings(selectedAgent.id, ids)}
        />
      )}
    </AgentBuilderView>
  );
}
