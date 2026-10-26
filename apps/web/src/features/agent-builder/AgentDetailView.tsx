import { useState } from 'react';
import type { MockAgent, MockKnowledgeBase, MockPlugin } from './mockData';
import { modelOptions, contextLimitOptions } from './mockData';

interface Props {
  agent: MockAgent;
  knowledgeBases: MockKnowledgeBase[];
  plugins: MockPlugin[];
  onBack: () => void;
  onSave: (updates: Partial<MockAgent>) => void;
  onUpdateKnowledgeBindings: (bindings: MockAgent['knowledgeBaseBindings']) => void;
  onUpdatePluginBindings: (bindings: MockAgent['pluginBindings']) => void;
}

export function AgentDetailView({
  agent,
  knowledgeBases,
  plugins,
  onBack,
  onSave,
  onUpdateKnowledgeBindings,
  onUpdatePluginBindings,
}: Props) {
  const [form, setForm] = useState({
    name: agent.name,
    description: agent.description,
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
    const next = agent.knowledgeBaseBindings.map((b) =>
      b.knowledgeBaseId === kbId ? { ...b, enabled: !b.enabled } : b,
    );
    onUpdateKnowledgeBindings(next);
  };

  const togglePlugin = (pluginId: string) => {
    const next = agent.pluginBindings.map((b) =>
      b.pluginId === pluginId ? { ...b, enabled: !b.enabled } : b,
    );
    onUpdatePluginBindings(next);
  };

  const togglePluginAutoInvoke = (pluginId: string) => {
    const next = agent.pluginBindings.map((b) =>
      b.pluginId === pluginId ? { ...b, autoInvoke: !b.autoInvoke } : b,
    );
    onUpdatePluginBindings(next);
  };

  const statusLabel: Record<MockAgent['status'], string> = {
    DRAFT: '草稿',
    ACTIVE: '已发布',
    ARCHIVED: '已归档',
  };

  const kbById = new Map(knowledgeBases.map((kb) => [kb.id, kb]));
  const pluginById = new Map(plugins.map((p) => [p.pluginId, p]));

  const enabledKbCount = agent.knowledgeBaseBindings.filter((b) => b.enabled).length;
  const enabledPluginCount = agent.pluginBindings.filter((b) => b.enabled).length;

  return (
    <div className="ab-detail">
      <header className="ab-detail-header">
        <button className="ab-btn ab-btn-ghost" onClick={onBack}>← 返回列表</button>
        <div className="ab-detail-title-row">
          <h2 className="ab-detail-title">{form.name || '未命名 Agent'}</h2>
          <span className={`ab-status-badge status-${agent.status.toLowerCase()}`}>{statusLabel[agent.status]}</span>
        </div>
        <button className="ab-btn ab-btn-primary" onClick={commit}>保存</button>
      </header>

      <div className="ab-detail-body">
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
            <h3 className="ab-section-title">
              知识库绑定 <span className="ab-section-count">{enabledKbCount}/{agent.knowledgeBaseBindings.length} 启用</span>
            </h3>
            {agent.knowledgeBaseBindings.length === 0 ? (
              <div className="ab-empty-inline">未绑定知识库</div>
            ) : (
              <ul className="ab-binding-list">
                {agent.knowledgeBaseBindings.map((b) => {
                  const kb = kbById.get(b.knowledgeBaseId);
                  return (
                    <li key={b.id} className={`ab-binding-item${!b.enabled ? ' is-disabled' : ''}`}>
                      <div className="ab-binding-info">
                        <div className="ab-binding-name">{kb?.name ?? b.knowledgeBaseId}</div>
                        {kb?.description && <div className="ab-binding-desc">{kb.description}</div>}
                      </div>
                      <label className="ab-switch">
                        <input
                          type="checkbox"
                          checked={b.enabled}
                          onChange={() => toggleKb(b.knowledgeBaseId)}
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
            <h3 className="ab-section-title">
              插件绑定 <span className="ab-section-count">{enabledPluginCount}/{agent.pluginBindings.length} 启用</span>
            </h3>
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
                        <label className="ab-checkbox-inline">
                          <input
                            type="checkbox"
                            checked={b.autoInvoke}
                            onChange={() => togglePluginAutoInvoke(b.pluginId)}
                          />
                          <span>自动调用</span>
                        </label>
                      </div>
                      <label className="ab-switch">
                        <input
                          type="checkbox"
                          checked={b.enabled}
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

        <aside className="ab-detail-col ab-detail-col-right">
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

          <div className="ab-meta">
            <div>创建于 {new Date(agent.createdAt).toLocaleString()}</div>
            <div>最后更新 {new Date(agent.updatedAt).toLocaleString()}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
