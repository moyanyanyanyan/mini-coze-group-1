import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { useOverlayFocus } from '../../hooks/useOverlayFocus';
import { BindingPickerModal, type PickerItem } from './BindingPickerModal';
import type {
  AgentDetailData, AgentFormValues, AgentSaveState, AgentStatus, BindingPickerKind,
  KnowledgeBaseOption, PluginOption, AgentVersionItem, AgentVersionPreview, AgentModelOption,
} from './types';

export interface AgentDetailViewProps {
  agent: AgentDetailData;
  knowledgeBases: KnowledgeBaseOption[];
  availableKnowledgeBases: KnowledgeBaseOption[];
  plugins: PluginOption[];
  form: AgentFormValues;
  update: <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) => void;
  modelOptions: AgentModelOption[];
  modelNotice: string | null;
  contextLimitOptions: number[];
  saveState: AgentSaveState;
  saveMessage: string;
  pluginSaving: boolean;
  pluginSaveError: string | null;
  pickerOpen: BindingPickerKind | null;
  versions: AgentVersionItem[];
  versionsLoading: boolean;
  versionsError: string | null;
  versionDetailOpen: boolean;
  selectedVersion: AgentVersionPreview | null;
  selectedVersionLoading: boolean;
  selectedVersionError: string | null;
  onBack: () => void;
  onSave: (values: AgentFormValues) => void;
  onStatusTransition: (status: AgentStatus, values?: AgentFormValues) => void;
  toggleKb: (id: string) => void;
  togglePlugin: (id: string) => void;
  onOpenPicker: (kind: BindingPickerKind) => void;
  onClosePicker: () => void;
  onConfirmPlugins: (ids: string[]) => void;
  onConfirmKnowledge: (ids: string[]) => void;
  openVersionDetail: (id: string) => void;
  closeVersionDetail: () => void;
}

export function AgentDetailView({
  agent, knowledgeBases, availableKnowledgeBases, plugins, form, update, modelOptions,
  modelNotice, contextLimitOptions, saveState, saveMessage, pluginSaving, pluginSaveError, pickerOpen,
  versions, versionsLoading, versionsError, versionDetailOpen, selectedVersion,
  selectedVersionLoading, selectedVersionError, onBack, onSave, onStatusTransition,
  toggleKb, togglePlugin, onOpenPicker, onClosePicker, onConfirmPlugins, onConfirmKnowledge,
  openVersionDetail, closeVersionDetail,
}: AgentDetailViewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'publish' | 'withdraw' | 'leave' | null>(null);
  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [basicInfoDraft, setBasicInfoDraft] = useState({ name: '', description: '' });
  const previewRef = useRef<HTMLElement>(null);
  useOverlayFocus(previewRef, previewOpen, () => setPreviewOpen(false));

  const openBasicInfo = () => {
    setBasicInfoDraft({ name: form.name, description: form.description });
    setBasicInfoOpen(true);
  };

  const confirmBasicInfo = () => {
    update('name', basicInfoDraft.name.trim());
    update('description', basicInfoDraft.description.trim());
    setBasicInfoOpen(false);
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

  const statusLabel: Record<AgentDetailData['status'], string> = {
    DRAFT: '草稿',
    ACTIVE: '已发布',
    ARCHIVED: '已归档',
  };

  const pluginById = new Map(plugins.map((p) => [p.pluginId, p]));

  const enabledKbCount = agent.knowledgeBaseBindings.filter((b) => b.enabled).length;
  const enabledPluginCount = agent.pluginBindings.filter((b) => b.enabled).length;

  const busy = saveState === 'saving' || pluginSaving;

  const selectedModel = modelOptions.find((option) => option.value === form.model);
  const modelsUsable = !modelNotice && modelOptions.length > 0;
  const modelUnavailable = modelsUsable && (!selectedModel || !selectedModel.enabled);
  const maxTokenLimit = modelsUsable && selectedModel ? selectedModel.maxOutputTokens : null;
  const tokenError = form.maxTokens < 1
    ? '最大输出长度需大于 0'
    : maxTokenLimit !== null && form.maxTokens > maxTokenLimit
      ? `最大输出长度不能超过 ${maxTokenLimit}`
      : null;
  const saveBlocked = modelUnavailable || tokenError !== null;

  const feedbackMessage = saveState === 'dirty' ? '有未保存修改' : saveMessage;

  const confirmText = {
    publish: '发布后线上将使用当前配置，确定发布？',
    withdraw: '撤回后智能体变为草稿，确定撤回？',
    leave: '有未保存的修改，确定离开？',
  };
  const confirmLabel = { publish: '确认发布', withdraw: '确认撤回', leave: '确认离开' };

  const confirmPending = () => {
    if (pendingAction === 'publish') onStatusTransition('ACTIVE', form);
    else if (pendingAction === 'withdraw') onStatusTransition('DRAFT');
    else if (pendingAction === 'leave') onBack();
    setPendingAction(null);
  };

  return (
    <div className="ab-detail">
      <header className="ab-detail-header">
        <button
          className="ab-btn ab-btn-ghost"
          onClick={() => { if (saveState === 'dirty') setPendingAction('leave'); else onBack(); }}
          disabled={pluginSaving}
        >
          ← 返回列表
        </button>
        <div className="ab-detail-title-row">
          <h2 className="ab-detail-title">{form.name || '未命名智能体'}</h2>
          <button type="button" className="ab-edit-chip" onClick={openBasicInfo} aria-label="编辑基础信息">
            <Icon name="edit" width={14} height={14} />
          </button>
          <span className={`ab-status-badge status-${agent.status.toLowerCase()}`}>{statusLabel[agent.status]}</span>
        </div>
        <div className="ab-detail-actions">
          <button className="ab-btn ab-btn-ghost ab-preview-toggle" onClick={() => setPreviewOpen(true)}>预览与版本</button>
          {agent.status === 'DRAFT' && (
            <button
              className="ab-btn ab-btn-ghost"
              onClick={() => setPendingAction('publish')}
              disabled={busy || saveBlocked}
            >
              发布
            </button>
          )}
          {agent.status === 'ACTIVE' && (
            <button
              className="ab-btn ab-btn-ghost"
              onClick={() => setPendingAction('withdraw')}
              disabled={busy}
            >
              撤回
            </button>
          )}
          <button
            className="ab-btn ab-btn-primary"
            onClick={() => onSave(form)}
            disabled={busy || saveBlocked}
          >
            {busy && <span className="ab-spinner" aria-hidden />}
            保存
          </button>
          {saveState !== 'idle' && feedbackMessage && (
            <span className={`ab-save-feedback ab-save-feedback--${saveState}`}>{feedbackMessage}</span>
          )}
        </div>
      </header>

      {pendingAction && (
        <div className="ab-confirm-bar" role="alertdialog" aria-label="操作确认">
          <span className="ab-confirm-bar-text">{confirmText[pendingAction]}</span>
          <div className="ab-confirm-bar-actions">
            <button type="button" className="ab-btn ab-btn-ghost ab-btn-mini" onClick={() => setPendingAction(null)}>
              取消
            </button>
            <button type="button" className="ab-btn ab-btn-primary ab-btn-mini" onClick={confirmPending}>
              {confirmLabel[pendingAction]}
            </button>
          </div>
        </div>
      )}

      <div className="ab-editor">
        <section className="ab-editor-left" aria-label="人设与回复逻辑">
          <div className="ab-editor-head-row">
            <h3 className="ab-editor-heading">人设与回复逻辑</h3>
          </div>

          <div className="ab-editor-left-body">
            <div className="ab-editor-prompt">
              <label className="ab-label" htmlFor="agent-system-prompt">回复逻辑</label>
              <textarea
                id="agent-system-prompt"
                className="ab-textarea ab-editor-prompt-input"
                value={form.systemPrompt}
                onChange={(e) => update('systemPrompt', e.target.value)}
                placeholder="描述智能体的角色、要完成的任务，以及回复时应遵循的规则。"
              />
              <div className="ab-editor-prompt-foot">{form.systemPrompt.length} 字</div>
            </div>
          </div>
        </section>

        <aside className="ab-editor-right" aria-label="编排">
          <div className="ab-editor-head-row">
            <h3 className="ab-editor-heading">编排</h3>
          </div>

          <CollapsibleSection title="模型设置" defaultOpen>
            <div className="ab-field">
              <label className="ab-label" htmlFor="agent-model">模型</label>
              <select
                id="agent-model"
                className={`ab-input${modelUnavailable ? ' ab-input-error' : ''}`}
                aria-invalid={modelUnavailable}
                value={form.model}
                onChange={(e) => update('model', e.target.value)}
              >
                {modelOptions.map((o) => (
                  <option key={o.value} value={o.value} disabled={!o.enabled}>{o.label}</option>
                ))}
                {!selectedModel && (
                  <option value={form.model}>{form.model}（不可用）</option>
                )}
              </select>
              {modelUnavailable && (
                <small className="ab-field-error" role="alert">
                  {selectedModel ? '该模型已停用，请更换模型后再保存。' : '当前模型不在可用列表中，请重新选择。'}
                </small>
              )}
              {modelNotice && <small className="ab-field-notice">{modelNotice}</small>}
            </div>

            <div className="ab-field-grid">
              <div className="ab-field">
                <label className="ab-label" htmlFor="agent-max-tokens">最大输出长度</label>
                <input
                  id="agent-max-tokens"
                  aria-describedby="agent-tokens-hint"
                  aria-invalid={Boolean(tokenError)}
                  className={`ab-input${tokenError ? ' ab-input-error' : ''}`}
                  type="number"
                  min={1}
                  max={maxTokenLimit ?? undefined}
                  value={form.maxTokens}
                  onChange={(e) => update('maxTokens', Number(e.target.value))}
                />
                <small id="agent-tokens-hint" className="ab-field-hint">
                  {maxTokenLimit !== null ? `该模型单次回复上限 ${maxTokenLimit} Token。` : '每次回复的 Token 上限。'}
                </small>
                {tokenError && <small className="ab-field-error" role="alert">{tokenError}</small>}
              </div>

              <div className="ab-field">
                <label className="ab-label" htmlFor="agent-context">历史消息轮数</label>
                <select id="agent-context" className="ab-input" value={form.contextLimit} onChange={(e) => update('contextLimit', Number(e.target.value))}>
                  {contextLimitOptions.map((n) => (
                    <option key={n} value={n}>{n} 轮</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ab-field">
              <label className="ab-label" htmlFor="agent-temperature">
                回答随机性 <span className="ab-field-value">{form.temperature.toFixed(1)}</span>
              </label>
              <input
                id="agent-temperature"
                aria-describedby="agent-temperature-hint"
                className="ab-range"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) => update('temperature', Number(e.target.value))}
              />
              <small id="agent-temperature-hint" className="ab-field-hint">数值越低越稳定，越高越多样。</small>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="技能"
            badge={agent.pluginBindings.length > 0
              ? `${enabledPluginCount}/${agent.pluginBindings.length}`
              : undefined}
            actions={(
              <button
                type="button"
                className="ab-btn ab-btn-ghost ab-btn-mini"
                onClick={() => { onOpenPicker('plugin'); }}
                disabled={busy || plugins.length === 0}
                title={plugins.length === 0 ? '插件目录暂无可用项' : '从目录中添加或移除'}
              >
                + 添加
              </button>
            )}
          >
            {pluginSaving && <p role="status">正在保存插件绑定…</p>}
            {pluginSaveError && <p role="alert">{pluginSaveError}</p>}
            {agent.pluginBindings.length === 0 ? (
              <div className="ab-empty-inline">未绑定插件</div>
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
          </CollapsibleSection>

          <CollapsibleSection
            title="知识"
            defaultOpen
            badge={agent.knowledgeBaseBindings.length > 0
              ? `${enabledKbCount}/${agent.knowledgeBaseBindings.length}`
              : undefined}
            actions={(
              <button
                type="button"
                className="ab-btn ab-btn-ghost ab-btn-mini"
                onClick={() => onOpenPicker('knowledge')}
                disabled={knowledgeBases.length === 0}
                title={knowledgeBases.length === 0 ? '知识库目录暂无可用项' : '从目录中添加或移除'}
              >
                + 添加
              </button>
            )}
          >
            {agent.knowledgeBaseBindings.length === 0 ? (
              <div className="ab-empty-inline">
                未绑定知识库
                <button
                  type="button"
                  className="ab-btn ab-btn-ghost ab-btn-mini"
                  onClick={() => onOpenPicker('knowledge')}
                  disabled={knowledgeBases.length === 0}
                >
                  选择知识库
                </button>
              </div>
            ) : (
              <ul className="ab-binding-list">
                {agent.knowledgeBaseBindings.map((binding) => {
                  const kb = availableKnowledgeBases.find((item) => item.id === binding.knowledgeBaseId);
                  return (
                    <li key={binding.knowledgeBaseId} className={`ab-binding-item${!binding.enabled ? ' is-disabled' : ''}`}>
                      <div className="ab-binding-info">
                        <div className="ab-binding-name">{kb?.name ?? binding.knowledgeBaseId}</div>
                        {kb?.description && <div className="ab-binding-desc">{kb.description}</div>}
                      </div>
                      <label className="ab-switch">
                        <input
                          type="checkbox"
                          checked={binding.enabled}
                          onChange={() => toggleKb(binding.knowledgeBaseId)}
                        />
                        <span className="ab-switch-slider" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="对话体验"
            badge={form.openingMessage ? '已设置' : undefined}
          >
            <div className="ab-field">
              <label className="ab-label" htmlFor="agent-opening">开场白</label>
              <textarea
                id="agent-opening"
                className="ab-textarea"
                value={form.openingMessage}
                onChange={(e) => update('openingMessage', e.target.value)}
                rows={3}
                placeholder="用户首次进入对话时看到的消息"
              />
              <small className="ab-field-hint">用户首次进入对话时展示。</small>
            </div>
          </CollapsibleSection>
        </aside>
      </div>

      {previewOpen && (
        <button className="ab-preview-backdrop" aria-label="关闭预览与版本" onClick={() => setPreviewOpen(false)} />
      )}
      <aside
        ref={previewRef}
        role="dialog"
        aria-modal={previewOpen}
        hidden={!previewOpen}
        className={`ab-preview-drawer${previewOpen ? ' is-open' : ''}`}
        aria-label="预览与版本"
      >
        <div className="ab-preview-heading">
          <strong>预览与版本</strong>
          <button className="ui-icon-button ab-preview-close" aria-label="关闭预览与版本" onClick={() => setPreviewOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
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
                        onClick={() => openVersionDetail(v.id)}
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

      {pickerOpen === 'plugin' && (
        <BindingPickerModal
          title="添加插件"
          subtitle="选择要绑定到此智能体的插件"
          items={pluginPickerItems}
          selectedIds={boundPluginIds}
          saving={pluginSaving}
          error={pluginSaveError}
          onConfirm={onConfirmPlugins}
          onClose={onClosePicker}
        />
      )}

      {pickerOpen === 'knowledge' && (
        <BindingPickerModal
          title="添加知识库"
          subtitle="选择要绑定到此智能体的知识库"
          items={knowledgePickerItems}
          selectedIds={boundKnowledgeIds}
          onConfirm={onConfirmKnowledge}
          onClose={onClosePicker}
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

      {basicInfoOpen && (
        <div className="ab-modal-backdrop" onClick={() => setBasicInfoOpen(false)} role="dialog" aria-modal="true" aria-label="编辑基础信息">
          <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ab-modal-header">
              <h3 className="ab-modal-title">编辑基础信息</h3>
              <button className="ab-modal-close" onClick={() => setBasicInfoOpen(false)} aria-label="关闭">×</button>
            </header>
            <form
              onSubmit={(e) => { e.preventDefault(); confirmBasicInfo(); }}
            >
              <div className="ab-field">
                <label className="ab-label" htmlFor="basic-name">
                  名称 <span className="ab-required">*</span>
                </label>
                <input
                  id="basic-name"
                  className="ab-input"
                  type="text"
                  value={basicInfoDraft.name}
                  maxLength={50}
                  placeholder="客服助手"
                  autoFocus
                  onChange={(e) => setBasicInfoDraft((d) => ({ ...d, name: e.target.value }))}
                />
                <span className="ab-field-hint">{basicInfoDraft.name.length}/50</span>
              </div>
              <div className="ab-field">
                <label className="ab-label" htmlFor="basic-description">描述（可选）</label>
                <textarea
                  id="basic-description"
                  className="ab-textarea"
                  value={basicInfoDraft.description}
                  rows={3}
                  maxLength={200}
                  placeholder="自动回复常见问题"
                  onChange={(e) => setBasicInfoDraft((d) => ({ ...d, description: e.target.value }))}
                />
                <span className="ab-field-hint">{basicInfoDraft.description.length}/200</span>
              </div>
              <footer className="ab-modal-footer">
                <button type="button" className="ab-btn ab-btn-ghost" onClick={() => setBasicInfoOpen(false)}>取消</button>
                <button
                  type="submit"
                  className="ab-btn ab-btn-primary"
                  disabled={!basicInfoDraft.name.trim()}
                >
                  保存
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface VersionSnapshotProps {
  snapshot: Record<string, unknown>;
  plugins: PluginOption[];
  knowledgeBases: KnowledgeBaseOption[];
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
        <span className="ab-snapshot-label">回答随机性</span>
        <span className="ab-snapshot-value">{temperature}</span>
      </div>
      <div className="ab-snapshot-row">
        <span className="ab-snapshot-label">最大输出长度</span>
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
