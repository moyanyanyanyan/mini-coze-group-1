import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentDetailView } from '@minicoze/ui/agent-builder';
import {
  modelOptions,
  contextLimitOptions,
  getAgentVersion,
  listAgentVersions,
  type AgentVersionDetail,
  type AgentVersionSummary,
  type Agent,
  type AgentStatus,
  type KnowledgeBaseSummary,
  type KnowledgeBindingItemInput,
  type PluginSummary,
  type UpdateAgentInput,
} from './agent.api';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type PickerKind = 'plugin' | 'knowledge';

interface Props {
  agent: Agent;
  knowledgeBases: KnowledgeBaseSummary[];
  plugins: PluginSummary[];
  saveState: SaveState;
  saveMessage: string;
  onBack: () => void;
  onSave: (updates: UpdateAgentInput) => void;
  onStatusTransition: (nextStatus: AgentStatus, updates?: UpdateAgentInput) => void;
  onUpdateKnowledgeBindings: (
    bindings: KnowledgeBindingItemInput[],
  ) => void;
  onUpdatePluginBindings: (
    bindings: Array<{ pluginId: string; enabled: boolean }>,
  ) => Promise<void>;
}

export function AgentDetailController({
  agent,
  knowledgeBases,
  plugins,
  saveState,
  saveMessage,
  onBack,
  onSave,
  onStatusTransition,
  onUpdateKnowledgeBindings,
  onUpdatePluginBindings,
}: Props) {
  const [pluginSaving, setPluginSaving] = useState(false);
  const [pluginSaveError, setPluginSaveError] = useState<string | null>(null);
  const pluginSavePending = useRef(false);
  const [pickerOpen, setPickerOpen] = useState<PickerKind | null>(null);
  const [versions, setVersions] = useState<AgentVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versionDetailOpen, setVersionDetailOpen] = useState(false);
  const versionRequestId = useRef(0);
  const [selectedVersion, setSelectedVersion] = useState<AgentVersionDetail | null>(null);
  const [selectedVersionLoading, setSelectedVersionLoading] = useState(false);
  const [selectedVersionError, setSelectedVersionError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const list = await listAgentVersions(agent.id);
      setVersions(list);
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : '加载版本历史失败');
    } finally {
      setVersionsLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions, agent.updatedAt, agent.pluginBindings, agent.knowledgeBaseBindings]);

  const closeVersionDetail = () => {
    // 关闭后忽略未完成的请求，避免旧结果覆盖下一次打开的版本。
    versionRequestId.current += 1;
    setVersionDetailOpen(false);
  };

  const openVersionDetail = async (versionId: string) => {
    const requestId = ++versionRequestId.current;
    setVersionDetailOpen(true);
    setSelectedVersion(null);
    setSelectedVersionError(null);
    setSelectedVersionLoading(true);
    try {
      const detail = await getAgentVersion(agent.id, versionId);
      if (requestId !== versionRequestId.current) return;
      setSelectedVersion(detail);
    } catch (err) {
      if (requestId !== versionRequestId.current) return;
      setSelectedVersionError(err instanceof Error ? err.message : '加载版本详情失败');
    } finally {
      if (requestId === versionRequestId.current) {
        setSelectedVersionLoading(false);
      }
    }
  };

  const [form, setForm] = useState({
    name: agent.name,
    description: agent.description ?? '',
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    contextLimit: agent.contextLimit,
    openingMessage: agent.openingMessage ?? '',
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const toggleKb = (kbId: string) => {
    const bindings = agent.knowledgeBaseBindings.map((b) => ({
      knowledgeBaseId: b.knowledgeBaseId,
      config: b.config,
      enabled: b.knowledgeBaseId === kbId ? !b.enabled : b.enabled,
    }));
    onUpdateKnowledgeBindings(bindings);
  };

  const savePluginBindings = async (
    bindings: Array<{ pluginId: string; enabled: boolean }>,
  ): Promise<boolean> => {
    // ref 立即锁定，避免同一次渲染中的连续点击提交旧绑定。
    if (pluginSavePending.current || saveState === 'saving') return false;
    pluginSavePending.current = true;
    setPluginSaving(true);
    setPluginSaveError(null);
    try {
      await onUpdatePluginBindings(bindings);
      return true;
    } catch (err) {
      setPluginSaveError(err instanceof Error ? err.message : '更新插件绑定失败');
      return false;
    } finally {
      pluginSavePending.current = false;
      setPluginSaving(false);
    }
  };

  const togglePlugin = (pluginId: string) => {
    const bindings = agent.pluginBindings.map((b) => ({
      pluginId: b.pluginId,
      enabled: b.pluginId === pluginId ? !b.enabled : b.enabled,
    }));
    void savePluginBindings(bindings);
  };

  const availableKnowledgeBases = knowledgeBases.filter((kb) => kb.status === 'ACTIVE');

  const confirmPlugins = async (ids: string[]) => {
    const bindings = ids.map((pluginId) => ({
      pluginId,
      enabled: agent.pluginBindings.find((binding) => binding.pluginId === pluginId)?.enabled ?? true,
    }));
    if (await savePluginBindings(bindings)) setPickerOpen(null);
  };

  const confirmKnowledge = (ids: string[]) => {
    onUpdateKnowledgeBindings(ids.map((knowledgeBaseId) => {
      const existing = agent.knowledgeBaseBindings.find((binding) => binding.knowledgeBaseId === knowledgeBaseId);
      return { knowledgeBaseId, enabled: existing?.enabled ?? true, config: existing?.config };
    }));
    setPickerOpen(null);
  };

  return (
    <AgentDetailView
      agent={agent}
      knowledgeBases={knowledgeBases}
      availableKnowledgeBases={availableKnowledgeBases}
      plugins={plugins}
      form={form}
      update={update}
      modelOptions={modelOptions}
      contextLimitOptions={contextLimitOptions}
      saveState={saveState}
      saveMessage={saveMessage}
      pluginSaving={pluginSaving}
      pluginSaveError={pluginSaveError}
      pickerOpen={pickerOpen}
      versions={versions}
      versionsLoading={versionsLoading}
      versionsError={versionsError}
      versionDetailOpen={versionDetailOpen}
      selectedVersion={selectedVersion}
      selectedVersionLoading={selectedVersionLoading}
      selectedVersionError={selectedVersionError}
      onBack={onBack}
      onSave={onSave}
      onStatusTransition={onStatusTransition}
      toggleKb={toggleKb}
      togglePlugin={togglePlugin}
      onOpenPicker={(kind) => {
        if (kind === 'plugin') setPluginSaveError(null);
        setPickerOpen(kind);
      }}
      onClosePicker={() => setPickerOpen(null)}
      onConfirmPlugins={confirmPlugins}
      onConfirmKnowledge={confirmKnowledge}
      openVersionDetail={openVersionDetail}
      closeVersionDetail={closeVersionDetail}
    />
  );
}
