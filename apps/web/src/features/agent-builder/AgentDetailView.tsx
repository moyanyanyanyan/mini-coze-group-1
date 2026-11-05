import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BindingPickerModal,
  type PickerItem,
} from './BindingPickerModal';
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
  onStatusTransition: (nextStatus: AgentStatus) => void;
  onUpdateKnowledgeBindings: (
    bindings: Array<{ knowledgeBaseId: string; enabled: boolean }>,
  ) => void;
  onUpdatePluginBindings: (
    bindings: Array<{ pluginId: string; enabled: boolean }>,
  ) => Promise<void>;
}

export function AgentDetailView({
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
  }, [fetchVersions, agent.updatedAt, agent.pluginBindings]);

  const closeVersionDetail = () => {
    // 关闭后忽略未完成的请求，避免旧结果覆盖下一次打开的版本。
    versionRequestId.current += 1;
    setVersionDetailOpen(false);
  };

  const openVersionDetail = async (version: AgentVersionSummary) => {
    const requestId = ++versionRequestId.current;
    setVersionDetailOpen(true);
    setSelectedVersion(null);
    setSelectedVersionError(null);
    setSelectedVersionLoading(true);
    try {
      const detail = await getAgentVersion(agent.id, version.id);
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

  const pluginPickerItems: PickerItem[] = useMemo(
    () => plugins.map((p) => ({ id: p.pluginId, title: p.title, description: p.content })),
    [plugins],
  );

  const knowledgePickerItems: PickerItem[] = useMemo(
    () =>
      knowledgeBases.map((kb) => ({
        id: kb.id,
        title: kb.name,
        description: kb.description,
      })),
    [knowledgeBases],
  );

  const boundPluginIds = useMemo(
    () => agent.pluginBindings.map((b) => b.pluginId),
    [agent.pluginBindings],
  );
  const boundKnowledgeIds = useMemo(
    () => agent.knowledgeBaseBindings.map((b) => b.knowledgeBaseId),
    [agent.knowledgeBaseBindings],
  );

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

  const commit = () => {
    onSave({
      name: form.name,
      description: form.description,
      systemPrompt: form.systemPrompt,
      model: form.model,
      temperature: form.temperature,
      maxTokens: form.maxTokens,
      contextLimit: form.contextLimit,
      openingMessage: form.openingMessage || undefined,
    });
  };

  const toggleKb = (kbId: string) => {
    const bindings = agent.knowledgeBaseBindings.map((b) => ({
      knowledgeBaseId: b.knowledgeBaseId,
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

  const statusLabel: Record<Agent['status'], string> = {
    DRAFT: '草稿',
    ACTIVE: '已发布',
    ARCHIVED: '已归档',
  };

  const availableKnowledgeBases = knowledgeBases.filter((kb) => kb.status === 'ACTIVE');
  const pluginById = new Map(plugins.map((p) => [p.pluginId, p]));

  const enabledKbCount = agent.knowledgeBaseBindings.filter((b) => b.enabled).length;
  const enabledPluginCount = agent.pluginBindings.filter((b) => b.enabled).length;

  const busy = saveState === 'saving' || pluginSaving;

  return (
    <div className="ab-detail">
      <header className="ab-detail-header">
        <button className="ab-btn ab-btn-ghost" onClick={onBack} disabled={pluginSaving}>← 返回列表</button>
        <div className="ab-detail-title-row">
          <h2 className="ab-detail-title">{form.name || '未命名智能体'}</h2>
          <span className={`ab-status-badge status-${agent.status.toLowerCase()}`}>{statusLabel[agent.status]}</span>
        </div>
        <div className="ab-detail-actions">
          <button className="ab-btn ab-btn-ghost ab-preview-toggle" onClick={() => setPreviewOpen(true)}>预览与版本</button>
          {agent.status === 'DRAFT' && (
            <button
              className="ab-btn ab-btn-success"
              onClick={() => onStatusTransition('ACTIVE')}
              disabled={busy}
            >
              发布
            </button>
          )}
          {agent.status === 'ACTIVE' && (
            <button
              className="ab-btn ab-btn-ghost"
              onClick={() => onStatusTransition('DRAFT')}
              disabled={busy}
            >
              撤回
            </button>
          )}
          <button
            className="ab-btn ab-btn-primary"
            onClick={commit}
            disabled={busy}
          >
            {busy && <span className="ab-spinner" aria-hidden />}
            {busy && saveMessage ? saveMessage : '保存'}
          </button>
          {saveState !== 'idle' && saveMessage && (
            <span className={`ab-save-feedback ab-save-feedback--${saveState}`}>{saveMessage}</span>
          )}
        </div>
      </header>

      <div className="ab-detail-body">
        <div className="ab-detail-main">
        <aside className="ab-detail-col ab-detail-col-left">
          <div className="ab-detail-avatar">{form.name.slice(0, 1) || '?'}</div>

          <div className="ab-field">
            <label className="ab-label">名称</label>
            <input
              className="ab-input"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="ab-field">
            <label className="ab-label">描述</label>
            <textarea
              className="ab-textarea"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="ab-field">
            <label className="ab-label">开场白</label>
            <textarea
              className="ab-textarea"
              value={form.openingMessage}
              onChange={(e) => update('openingMessage', e.target.value)}
              rows={2}
              placeholder="用户首次进入对话时看到的消息"
            />
          </div>
        </aside>

        <section className="ab-detail-col ab-detail-col-center">
          <div className="ab-section">
            <h3 className="ab-section-title">模型参数</h3>

            <div className="ab-field-grid">
              <div className="ab-field">
                <label className="ab-label">模型</label>
                <select className="ab-input" value={form.model} onChange={(e) => update('model', e.target.value)}>
                  {modelOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="ab-field">
                <label className="ab-label">maxTokens</label>
                <input
                  className="ab-input"
                  type="number"
                  min={1}
                  max={8192}
                  value={form.maxTokens}
                  onChange={(e) => update('maxTokens', Number(e.target.value))}
                />
              </div>

              <div className="ab-field">
                <label className="ab-label">
                  temperature <span className="ab-field-value">{form.temperature.toFixed(1)}</span>
                </label>
                <input
                  className="ab-range"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => update('temperature', Number(e.target.value))}
                />
              </div>

              <div className="ab-field">
                <label className="ab-label">历史消息轮数</label>
                <select className="ab-input" value={form.contextLimit} onChange={(e) => update('contextLimit', Number(e.target.value))}>
                  {contextLimitOptions.map((n) => (
                    <option key={n} value={n}>{n} 轮</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="ab-section">
            <h3 className="ab-section-title">系统提示词</h3>
            <textarea
              className="ab-textarea ab-textarea-large"
              value={form.systemPrompt}
              onChange={(e) => update('systemPrompt', e.target.value)}
              rows={6}
              placeholder="你是一个...请..."
            />
          </div>

          <div className="ab-section">
            <div className="ab-section-title-row">
              <h3 className="ab-section-title">
                知识库绑定 <span className="ab-section-count">{enabledKbCount}/{agent.knowledgeBaseBindings.length} 启用</span>
              </h3>
              <button
                type="button"
                className="ab-btn ab-btn-ghost ab-btn-mini"
                onClick={() => setPickerOpen('knowledge')}
                disabled={knowledgeBases.length === 0}
                title={knowledgeBases.length === 0 ? '知识库目录暂无可用项' : '从目录中添加或移除'}
              >
                + 添加
              </button>
            </div>
            {agent.knowledgeBaseBindings.length === 0 ? (
              <div className="ab-empty-inline">
                未绑定知识库
                <button
                  type="button"
                  className="ab-btn ab-btn-ghost ab-btn-mini"
                  onClick={() => setPickerOpen('knowledge')}
                  disabled={knowledgeBases.length === 0}
                >
                  选择知识库
                </button>
              </div>
            ) : (
              <ul className="ab-binding-list">
                {availableKnowledgeBases.map((kb) => {
                  const binding = agent.knowledgeBaseBindings.find((b) => b.knowledgeBaseId === kb.id);
                  return (
                    <li key={kb.id} className={`ab-binding-item${!binding?.enabled ? ' is-disabled' : ''}`}>
                      <div className="ab-binding-info">
                        <div className="ab-binding-name">{kb.name}</div>
                        {kb?.description && <div className="ab-binding-desc">{kb.description}</div>}
                      </div>
                      <label className="ab-switch">
                        <input
                          type="checkbox"
                          checked={binding?.enabled ?? false}
                          onChange={() => toggleKb(kb.id)}
                        />
                        <span className="ab-switch-slider" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="ab-section">
            <div className="ab-section-title-row">
              <h3 className="ab-section-title">
                插件绑定 <span className="ab-section-count">{enabledPluginCount}/{agent.pluginBindings.length} 启用</span>
              </h3>
              <button
                type="button"
                className="ab-btn ab-btn-ghost ab-btn-mini"
                onClick={() => { setPluginSaveError(null); setPickerOpen('plugin'); }}
                disabled={busy || plugins.length === 0}
                title={plugins.length === 0 ? '插件目录暂无可用项' : '从目录中添加或移除'}
              >
                + 添加
              </button>
            </div>
            {pluginSaving && <p role="status">正在保存插件绑定…</p>}
            {pluginSaveError && <p role="alert">{pluginSaveError}</p>}
            {agent.pluginBindings.length === 0 ? (
              <div className="ab-empty-inline">
                未绑定插件
                <button
                  type="button"
                  className="ab-btn ab-btn-ghost ab-btn-mini"
                  onClick={() => { setPluginSaveError(null); setPickerOpen('plugin'); }}
                  disabled={busy || plugins.length === 0}
                >
                  选择插件
                </button>
              </div>
            ) : (
              <ul className="ab-binding-list">
                {agent.pluginBindings.map((b) => {
                  const p = pluginById.get(b.pluginId);
                  return (
                    <li key={b.id} className={`ab-binding-item${!b.enabled ? ' is-disabled' : ''}`}>
                      <div className="ab-binding-info">
                        <div className="ab-binding-name">{p?.title ?? b.pluginId}</div>
                        <div className="ab-binding-desc">{p?.content ?? ''}</div>
                      </div>
                      <label className="ab-switch">
                        <input
                          type="checkbox"
                          checked={b.enabled}
                          disabled={busy}
                          onChange={() => togglePlugin(b.pluginId)}
                        />
                        <span className="ab-switch-slider" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        </div>
        {previewOpen && <button className="ab-preview-backdrop" aria-label="关闭预览与版本" onClick={() => setPreviewOpen(false)} />}
        <aside className={`ab-detail-col ab-detail-col-right${previewOpen ? ' is-open' : ''}`} aria-label="预览与版本">
          <button className="ab-btn ab-btn-ghost ab-preview-close" onClick={() => setPreviewOpen(false)}>关闭预览与版本</button>
          <div className="ab-section ab-preview">
            <h3 className="ab-section-title">开场白预览</h3>
            <div className="ab-preview-bubble">
              {form.openingMessage || <span className="ab-preview-empty">（未设置开场白）</span>}
            </div>
          </div>

          <div className="ab-section">
            <h3 className="ab-section-title">绑定概览</h3>
            <div className="ab-stat-row">
              <span>插件</span><strong>{enabledPluginCount}/{agent.pluginBindings.length}</strong>
            </div>
            <div className="ab-stat-row">
              <span>知识库</span><strong>{enabledKbCount}/{agent.knowledgeBaseBindings.length}</strong>
            </div>
            <div className="ab-stat-row">
              <span>工作流</span><strong>{agent.workflowBindings.filter((b) => b.enabled).length}/{agent.workflowBindings.length}</strong>
            </div>
          </div>

          <div className="ab-section">
            <h3 className="ab-section-title">版本历史</h3>
            {versionsLoading && <div className="ab-versions-empty">加载中…</div>}
            {versionsError && <div className="ab-versions-empty ab-versions-error">{versionsError}</div>}
            {!versionsLoading && !versionsError && versions.length === 0 && (
              <div className="ab-versions-empty">暂无版本记录</div>
            )}
            {!versionsLoading && !versionsError && versions.length > 0 && (
              <ul className="ab-versions-list">
                {versions.map((v, idx) => (
                  <li key={v.id} className="ab-version-item">
                    <button
                      type="button"
                      className="ab-version-btn"
                      onClick={() => openVersionDetail(v)}
                      title="查看此版本快照"
                    >
                      <span className="ab-version-num">v{v.version}</span>
                    </button>
                    <span className="ab-version-time">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    {idx === 0 && agent.status === 'ACTIVE' && (
                      <span className="ab-version-current">当前</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ab-meta">
            <div>创建于 {new Date(agent.createdAt).toLocaleString()}</div>
            <div>最后更新 {new Date(agent.updatedAt).toLocaleString()}</div>
          </div>
        </aside>
      </div>

      {pickerOpen === 'plugin' && (
        <BindingPickerModal
          title="添加插件"
          subtitle="选择要绑定到此智能体的插件"
          items={pluginPickerItems}
          selectedIds={boundPluginIds}
          saving={pluginSaving}
          error={pluginSaveError}
          onConfirm={async (ids) => {
            const bindings = ids.map((pluginId) => ({
              pluginId,
              enabled: agent.pluginBindings.find((binding) => binding.pluginId === pluginId)?.enabled ?? true,
            }));
            if (await savePluginBindings(bindings)) setPickerOpen(null);
          }}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {pickerOpen === 'knowledge' && (
        <BindingPickerModal
          title="添加知识库"
          subtitle="选择要绑定到此智能体的知识库"
          items={knowledgePickerItems}
          selectedIds={boundKnowledgeIds}
          onConfirm={(ids) => {
            onUpdateKnowledgeBindings(
              ids.map((knowledgeBaseId) => ({ knowledgeBaseId, enabled: true })),
            );
            setPickerOpen(null);
          }}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {versionDetailOpen && (
        <div className="ab-modal-backdrop" onClick={closeVersionDetail} role="dialog" aria-modal="true" aria-label="版本详情">
          <div className="ab-modal ab-modal-picker" onClick={(e) => e.stopPropagation()}>
            <header className="ab-modal-header">
              <h3 className="ab-modal-title">
                版本快照 {selectedVersion?.version ? `v${selectedVersion.version}` : ''}
              </h3>
              <button className="ab-modal-close" onClick={closeVersionDetail} aria-label="关闭">×</button>
            </header>
            <div className="ab-modal-body">
              {selectedVersionLoading && <div className="ab-versions-empty">加载中…</div>}
              {selectedVersionError && <div className="ab-versions-empty ab-versions-error">{selectedVersionError}</div>}
              {selectedVersion && <VersionSnapshot snapshot={selectedVersion.snapshot} plugins={plugins} knowledgeBases={knowledgeBases} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface VersionSnapshotProps {
  snapshot: Record<string, unknown>;
  plugins: PluginSummary[];
  knowledgeBases: KnowledgeBaseSummary[];
}

function VersionSnapshot({ snapshot, plugins, knowledgeBases }: VersionSnapshotProps) {
  const model = (snapshot.model as string) ?? '';
  const temperature = (snapshot.temperature as number) ?? 0;
  const maxTokens = (snapshot.maxTokens as number) ?? 0;
  const systemPrompt = (snapshot.systemPrompt as string) ?? '';
  const pluginIds = (snapshot.pluginIds as string[]) ?? [];
  const kbIds = (snapshot.knowledgeBaseIds as string[]) ?? [];
  const pluginById = new Map(plugins.map((p) => [p.pluginId, p]));
  const kbById = new Map(knowledgeBases.map((k) => [k.id, k]));

  return (
    <div className="ab-snapshot">
      <div className="ab-snapshot-row">
        <span className="ab-snapshot-label">模型</span>
        <span className="ab-snapshot-value">{model || '—'}</span>
      </div>
      <div className="ab-snapshot-row">
        <span className="ab-snapshot-label">temperature</span>
        <span className="ab-snapshot-value">{temperature}</span>
      </div>
      <div className="ab-snapshot-row">
        <span className="ab-snapshot-label">maxTokens</span>
        <span className="ab-snapshot-value">{maxTokens}</span>
      </div>

      <div className="ab-snapshot-block">
        <div className="ab-snapshot-label">系统提示词</div>
        <pre className="ab-snapshot-prompt">{systemPrompt || '（空）'}</pre>
      </div>

      <div className="ab-snapshot-block">
        <div className="ab-snapshot-label">启用的插件 ({pluginIds.length})</div>
        {pluginIds.length === 0 ? (
          <div className="ab-snapshot-empty-inline">无</div>
        ) : (
          <ul className="ab-snapshot-tags">
            {pluginIds.map((id) => (
              <li key={id} className="ab-snapshot-tag">
                {pluginById.get(id)?.title ?? id}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ab-snapshot-block">
        <div className="ab-snapshot-label">启用的知识库 ({kbIds.length})</div>
        {kbIds.length === 0 ? (
          <div className="ab-snapshot-empty-inline">无</div>
        ) : (
          <ul className="ab-snapshot-tags">
            {kbIds.map((id) => (
              <li key={id} className="ab-snapshot-tag ab-snapshot-tag-kb">
                {kbById.get(id)?.name ?? id}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
