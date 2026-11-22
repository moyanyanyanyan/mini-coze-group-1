import { useEffect, useMemo, useState } from 'react';
import { ActionMenu } from '../../components/ActionMenu';
import { Icon } from '../../components/Icon';
import './model-management.css';
import type {
  ModelConfigListItem,
  ModelConfigType,
  ModelManagementViewProps,
  ModelProviderListItem,
} from './types';

interface ConfigDrawerState {
  mode: 'create' | 'edit';
  item: ModelConfigListItem | null;
}

interface ProviderDialogState {
  mode: 'create' | 'edit';
  item: ModelProviderListItem | null;
}

interface ConfigFormState {
  name: string;
  providerId: string;
  modelIdentifier: string;
  type: ModelConfigType;
  dimension: string;
  baseUrl: string;
  apiKey: string;
}

interface ProviderFormState {
  name: string;
  defaultBaseUrl: string;
}

const PAGE_SIZES = [10, 20, 50];
const EMPTY_CONFIG_FORM: ConfigFormState = {
  name: '',
  providerId: '',
  modelIdentifier: '',
  type: 'CHAT',
  dimension: '',
  baseUrl: '',
  apiKey: '',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后再试';
}

export function ModelManagementView({
  activeTab,
  onTabChange,
  filters,
  configs,
  configsTotal,
  configsLoading,
  configsError,
  providers,
  providersLoading,
  providersError,
  page,
  pageSize,
  savingConfig,
  savingProvider,
  formError,
  actionError,
  onDismissActionError,
  actions,
}: ModelManagementViewProps) {
  const [drawer, setDrawer] = useState<ConfigDrawerState | null>(null);
  const [providerDialog, setProviderDialog] = useState<ProviderDialogState | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(EMPTY_CONFIG_FORM);
  const [providerForm, setProviderForm] = useState<ProviderFormState>({ name: '', defaultBaseUrl: '' });
  const [showKey, setShowKey] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawer && !providerDialog) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawer(null);
        setProviderDialog(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawer, providerDialog]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === configForm.providerId) ?? null,
    [configForm.providerId, providers],
  );

  /** 服务商预置模型：选中服务商后自动带出标识、类型与维度。 */
  const presetModels = useMemo(
    () => selectedProvider?.presetModels ?? [],
    [selectedProvider],
  );
  const isPresetIdentifier = presetModels.some(
    (preset) => preset.identifier === configForm.modelIdentifier,
  );

  const totalPages = Math.max(1, Math.ceil(configsTotal / pageSize));
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  }, [page, totalPages]);

  /** 切换服务商时默认选中它的第一个预置模型；没有预置则保留手填。 */
  function presetFormPatch(providerId: string): Partial<ConfigFormState> {
    const provider = providers.find((item) => item.id === providerId);
    const preset = provider?.presetModels?.[0];
    if (!preset) {
      return { providerId };
    }
    return {
      providerId,
      modelIdentifier: preset.identifier,
      type: preset.type,
      dimension: preset.dimension ? String(preset.dimension) : '',
    };
  }

  function handleProviderChange(providerId: string) {
    setConfigForm((form) => ({ ...form, ...presetFormPatch(providerId) }));
  }

  function handleIdentifierChange(identifier: string) {
    if (identifier === '__custom__') {
      setConfigForm((form) => ({ ...form, modelIdentifier: '' }));
      return;
    }
    const preset = presetModels.find((item) => item.identifier === identifier);
    setConfigForm((form) => ({
      ...form,
      modelIdentifier: identifier,
      ...(preset
        ? { type: preset.type, dimension: preset.dimension ? String(preset.dimension) : '' }
        : {}),
    }));
  }

  function openCreateConfig() {
    setLocalError(null);
    actions.onClearFormError();
    setShowKey(false);
    const defaultProviderId = filters.providerId || providers[0]?.id || '';
    setConfigForm({ ...EMPTY_CONFIG_FORM, ...presetFormPatch(defaultProviderId) });
    setDrawer({ mode: 'create', item: null });
  }

  function openEditConfig(item: ModelConfigListItem) {
    setLocalError(null);
    actions.onClearFormError();
    setShowKey(false);
    setConfigForm({
      name: item.name,
      providerId: item.providerId,
      modelIdentifier: item.modelIdentifier,
      type: item.type,
      dimension: item.dimension ? String(item.dimension) : '',
      baseUrl: item.baseUrl ?? '',
      apiKey: '',
    });
    setDrawer({ mode: 'edit', item });
  }

  function openCreateProvider() {
    setLocalError(null);
    actions.onClearFormError();
    setProviderForm({ name: '', defaultBaseUrl: '' });
    setProviderDialog({ mode: 'create', item: null });
  }

  function openEditProvider(item: ModelProviderListItem) {
    setLocalError(null);
    actions.onClearFormError();
    setProviderForm({ name: item.name, defaultBaseUrl: item.defaultBaseUrl });
    setProviderDialog({ mode: 'edit', item });
  }

  async function submitConfig() {
    if (!drawer) {
      return;
    }
    const name = configForm.name.trim();
    const modelIdentifier = configForm.modelIdentifier.trim();
    const dimension = Number(configForm.dimension);

    if (!configForm.providerId) {
      setLocalError('请选择服务商');
      return;
    }
    if (!name) {
      setLocalError('请填写模型名称');
      return;
    }
    if (!modelIdentifier) {
      setLocalError('请填写模型标识');
      return;
    }
    if (
      configForm.type === 'EMBEDDING'
      && (!Number.isInteger(dimension) || dimension < 1 || dimension > 8192)
    ) {
      setLocalError('向量维度需为 1-8192 的整数');
      return;
    }
    if (drawer.mode === 'create' && !configForm.apiKey.trim()) {
      setLocalError('请填写 API Key');
      return;
    }

    setLocalError(null);
    const saved = await actions.onSaveConfig(drawer.mode, drawer.item?.id ?? null, {
      providerId: configForm.providerId,
      name,
      modelIdentifier,
      type: configForm.type,
      dimension: configForm.type === 'EMBEDDING' ? dimension : null,
      baseUrl: configForm.baseUrl.trim() || null,
      ...(configForm.apiKey.trim() ? { apiKey: configForm.apiKey.trim() } : {}),
    });
    if (saved) {
      setDrawer(null);
    }
  }

  async function submitProvider() {
    if (!providerDialog) {
      return;
    }
    if (!providerForm.name.trim()) {
      setLocalError('请填写服务商名称');
      return;
    }
    if (!providerForm.defaultBaseUrl.trim()) {
      setLocalError('请填写默认调用地址');
      return;
    }

    setLocalError(null);
    const saved = await actions.onSaveProvider(
      providerDialog.mode,
      providerDialog.item?.id ?? null,
      { name: providerForm.name.trim(), defaultBaseUrl: providerForm.defaultBaseUrl.trim() },
    );
    if (saved) {
      setProviderDialog(null);
    }
  }

  return (
    <section className="feature-page model-page">
      <div className="model-content">
        <header className="model-heading">
          <div>
            <h1>模型管理</h1>
            <p>统一维护服务商与模型连接配置。API Key 加密入库，任何接口与日志都不会返回明文。</p>
          </div>
          <span className="model-protocol-chip">OpenAI 兼容协议</span>
        </header>

        <div className="model-tabs-row">
          <nav className="model-tabs" aria-label="模型管理视图">
            <button
              type="button"
              className={activeTab === 'configs' ? 'is-active' : ''}
              onClick={() => onTabChange('configs')}
            >
              模型配置
            </button>
            <button
              type="button"
              className={activeTab === 'providers' ? 'is-active' : ''}
              onClick={() => onTabChange('providers')}
            >
              服务商
            </button>
          </nav>
          {activeTab === 'configs' ? (
            <button
              type="button"
              className="model-primary"
              onClick={openCreateConfig}
              disabled={providers.length === 0}
              title={providers.length === 0 ? '请先在「服务商」中创建服务商' : undefined}
            >
              <Icon name="plus" />
              新建模型
            </button>
          ) : (
            <button type="button" className="model-primary" onClick={openCreateProvider}>
              <Icon name="plus" />
              新建服务商
            </button>
          )}
        </div>

        {actionError ? (
          <div className="model-banner" role="alert">
            <span>{actionError}</span>
            <button type="button" aria-label="关闭提示" onClick={onDismissActionError}>
              <Icon name="close" />
            </button>
          </div>
        ) : null}

        {activeTab === 'configs' ? (
          <div className="model-card">
            <div className="model-toolbar">
              <label className="model-search">
                <input
                  type="search"
                  value={filters.keyword}
                  placeholder="搜索模型名称或模型标识"
                  aria-label="搜索模型"
                  onChange={(event) => actions.onFiltersChange({ keyword: event.target.value })}
                />
              </label>
              <select
                className="model-select"
                aria-label="筛选服务商"
                value={filters.providerId}
                onChange={(event) => actions.onFiltersChange({ providerId: event.target.value })}
              >
                <option value="">全部服务商</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
              <select
                className="model-select"
                aria-label="筛选状态"
                value={filters.status}
                onChange={(event) => actions.onFiltersChange({
                  status: event.target.value as typeof filters.status,
                })}
              >
                <option value="all">全部状态</option>
                <option value="enabled">已启用</option>
                <option value="disabled">已停用</option>
              </select>
              <select
                className="model-select"
                aria-label="筛选类型"
                value={filters.type}
                onChange={(event) => actions.onFiltersChange({
                  type: event.target.value as typeof filters.type,
                })}
              >
                <option value="all">全部类型</option>
                <option value="CHAT">对话模型</option>
                <option value="EMBEDDING">向量模型</option>
              </select>
              <label className="model-switch">
                <input
                  type="checkbox"
                  checked={filters.status === 'enabled'}
                  onChange={(event) => actions.onFiltersChange({
                    status: event.target.checked ? 'enabled' : 'all',
                  })}
                />
                <span aria-hidden="true" />
                仅可用
              </label>
              <button type="button" className="model-ghost" onClick={actions.onResetFilters}>
                重置
              </button>
            </div>

            {configsError ? <div className="model-error">{configsError}</div> : null}

            <div className="model-table-wrap">
              <table className="model-table">
                <thead>
                  <tr>
                    <th scope="col">模型名称</th>
                    <th scope="col">服务商</th>
                    <th scope="col">模型标识</th>
                    <th scope="col">类型</th>
                    <th scope="col">维度</th>
                    <th scope="col">Base URL</th>
                    <th scope="col" className="is-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {configsLoading ? (
                    <tr>
                      <td colSpan={7} className="model-empty">正在加载模型配置…</td>
                    </tr>
                  ) : configs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="model-empty">
                        暂无符合条件的模型配置，可直接新建一个模型接入。
                      </td>
                    </tr>
                  ) : configs.map((item) => (
                    <tr key={item.id} className={item.enabled ? '' : 'is-disabled'}>
                      <td>
                        <div className="model-name-cell">
                          <span className={`model-dot ${item.enabled ? 'is-on' : 'is-off'}`} title={item.enabled ? '已启用' : '已停用'} />
                          <div>
                            <strong>{item.name}</strong>
                            <small>API Key · {item.maskedKey}</small>
                          </div>
                        </div>
                      </td>
                      <td>{item.providerName}</td>
                      <td><code className="model-code">{item.modelIdentifier}</code></td>
                      <td>
                        <span className={`model-badge ${item.type === 'EMBEDDING' ? 'is-embedding' : ''}`}>
                          {item.type === 'EMBEDDING' ? '向量' : '对话'}
                        </span>
                      </td>
                      <td className="model-muted">{item.dimension ?? '—'}</td>
                      <td>
                        <span className="model-url" title={item.effectiveBaseUrl}>{item.effectiveBaseUrl}</span>
                      </td>
                      <td className="is-actions">
                        <div className="model-row-actions">
                          <button type="button" className="model-link" onClick={() => openEditConfig(item)}>
                            编辑
                          </button>
                          <ActionMenu label={`${item.name} 更多操作`} floating>
                            <button
                              type="button"
                              onClick={() => {
                                void actions.onToggleConfig(item, !item.enabled);
                              }}
                            >
                              {item.enabled ? '停用' : '启用'}
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              onClick={() => {
                                void actions.onDeleteConfig(item);
                              }}
                            >
                              删除
                            </button>
                          </ActionMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="model-table-footer">
              <span>共 {configsTotal} 条</span>
              <div className="model-pagination">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => actions.onPageChange(page - 1)}
                >
                  上一页
                </button>
                {pageNumbers.map((pageNumber) => (
                  <button
                    type="button"
                    key={pageNumber}
                    className={pageNumber === page ? 'is-active' : ''}
                    onClick={() => actions.onPageChange(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => actions.onPageChange(page + 1)}
                >
                  下一页
                </button>
                <select
                  className="model-page-size"
                  aria-label="每页条数"
                  value={pageSize}
                  onChange={(event) => actions.onPageSizeChange(Number(event.target.value))}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size} 条/页</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="model-card">
            <div className="model-provider-note">
              <div>
                <h2>服务商</h2>
                <p>一个服务商可以配置多个模型；模型未填写独立地址时，继承服务商默认地址。</p>
              </div>
            </div>

            {providersError ? <div className="model-error">{providersError}</div> : null}

            <div className="model-table-wrap">
              <table className="model-table">
                <thead>
                  <tr>
                    <th scope="col">服务商名称</th>
                    <th scope="col">协议</th>
                    <th scope="col">默认 Base URL</th>
                    <th scope="col">模型数量</th>
                    <th scope="col" className="is-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {providersLoading ? (
                    <tr>
                      <td colSpan={5} className="model-empty">正在加载服务商…</td>
                    </tr>
                  ) : providers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="model-empty">暂无服务商，请先新建一个 OpenAI 兼容服务。</td>
                    </tr>
                  ) : providers.map((provider) => (
                    <tr key={provider.id}>
                      <td>
                        <div className="model-provider-name">
                          <strong>{provider.name}</strong>
                          {provider.builtinKey ? <span className="model-badge is-soft">内置</span> : null}
                        </div>
                      </td>
                      <td className="model-muted">OpenAI 兼容</td>
                      <td><span className="model-url" title={provider.defaultBaseUrl}>{provider.defaultBaseUrl}</span></td>
                      <td className="model-muted">{provider.modelCount}</td>
                      <td className="is-actions">
                        <div className="model-row-actions">
                          <button type="button" className="model-link" onClick={() => openEditProvider(provider)}>
                            编辑
                          </button>
                          <button
                            type="button"
                            className="model-link is-danger"
                            onClick={() => {
                              void actions.onDeleteProvider(provider);
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {drawer ? (
        <div
          className="model-drawer-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDrawer(null);
            }
          }}
        >
          <aside className="model-drawer" role="dialog" aria-modal="true" aria-labelledby="model-drawer-title">
            <header>
              <div>
                <h2 id="model-drawer-title">{drawer.mode === 'create' ? '新建模型' : '编辑模型'}</h2>
                <p>保存仅代表配置已入库，连通性请通过内部测试接口验证。</p>
              </div>
              <button type="button" className="model-icon-button" aria-label="关闭" onClick={() => setDrawer(null)}>
                <Icon name="close" />
              </button>
            </header>

            <div className="model-form">
              <label className="model-field">
                <span>模型名称</span>
                <input
                  value={configForm.name}
                  placeholder="例如：DeepSeek Chat"
                  onChange={(event) => setConfigForm((form) => ({ ...form, name: event.target.value }))}
                />
              </label>

              <label className="model-field">
                <span>服务商</span>
                <select
                  value={configForm.providerId}
                  onChange={(event) => handleProviderChange(event.target.value)}
                >
                  <option value="">请选择服务商</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.name}</option>
                  ))}
                </select>
              </label>

              <div className="model-field">
                <span>模型标识</span>
                {presetModels.length > 0 ? (
                  <select
                    value={isPresetIdentifier ? configForm.modelIdentifier : '__custom__'}
                    onChange={(event) => handleIdentifierChange(event.target.value)}
                  >
                    {presetModels.map((preset) => (
                      <option key={preset.identifier} value={preset.identifier}>
                        {preset.identifier} · {preset.label}
                      </option>
                    ))}
                    <option value="__custom__">其他（手动填写）</option>
                  </select>
                ) : null}
                {presetModels.length === 0 || !isPresetIdentifier ? (
                  <input
                    value={configForm.modelIdentifier}
                    placeholder="例如：deepseek-chat"
                    onChange={(event) => setConfigForm((form) => ({ ...form, modelIdentifier: event.target.value }))}
                  />
                ) : null}
                <small>
                  {presetModels.length > 0
                    ? '选择模型标识后，模型类型与向量维度会自动带出。'
                    : '该服务商没有预置模型，请手动填写模型标识。'}
                </small>
              </div>

              <fieldset className="model-field">
                <legend>模型类型</legend>
                <div className="model-type-options">
                  <label className={configForm.type === 'CHAT' ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="model-type"
                      checked={configForm.type === 'CHAT'}
                      onChange={() => setConfigForm((form) => ({ ...form, type: 'CHAT', dimension: '' }))}
                    />
                    对话模型
                    <small>用于对话、工具调用</small>
                  </label>
                  <label className={configForm.type === 'EMBEDDING' ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="model-type"
                      checked={configForm.type === 'EMBEDDING'}
                      onChange={() => setConfigForm((form) => ({ ...form, type: 'EMBEDDING' }))}
                    />
                    向量模型
                    <small>用于知识库检索</small>
                  </label>
                </div>
              </fieldset>

              {configForm.type === 'EMBEDDING' ? (
                <label className="model-field">
                  <span>向量维度</span>
                  <input
                    type="number"
                    min={1}
                    max={8192}
                    value={configForm.dimension}
                    placeholder="例如：1536"
                    onChange={(event) => setConfigForm((form) => ({ ...form, dimension: event.target.value }))}
                  />
                </label>
              ) : null}

              <label className="model-field">
                <span>Base URL</span>
                <input
                  value={configForm.baseUrl}
                  placeholder={selectedProvider?.defaultBaseUrl ?? 'https://api.example.com/v1'}
                  onChange={(event) => setConfigForm((form) => ({ ...form, baseUrl: event.target.value }))}
                />
                <small>留空时继承服务商默认地址</small>
              </label>

              <label className="model-field">
                <span>API Key</span>
                <div className="model-key-input">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={configForm.apiKey}
                    autoComplete="off"
                    placeholder={drawer.mode === 'edit' ? '留空表示不修改' : '粘贴服务商 API Key'}
                    onChange={(event) => setConfigForm((form) => ({ ...form, apiKey: event.target.value }))}
                  />
                  <button type="button" onClick={() => setShowKey((value) => !value)}>
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
                <small>{drawer.mode === 'edit' ? '已保存的 Key 不会回显；重新填写才会覆盖。' : '加密入库，接口只返回前 4 位。'}</small>
              </label>

              {localError ?? formError ? (
                <div className="model-form-error">{localError ?? formError}</div>
              ) : null}
            </div>

            <footer>
              <button type="button" className="model-ghost" onClick={() => setDrawer(null)} disabled={savingConfig}>
                取消
              </button>
              <button
                type="button"
                className="model-primary"
                onClick={() => {
                  void submitConfig().catch((error: unknown) => setLocalError(errorMessage(error)));
                }}
                disabled={savingConfig}
              >
                {savingConfig ? '保存中…' : '保存'}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}

      {providerDialog ? (
        <div
          className="model-dialog-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setProviderDialog(null);
            }
          }}
        >
          <div className="model-dialog" role="dialog" aria-modal="true" aria-labelledby="model-provider-title">
            <header>
              <h2 id="model-provider-title">
                {providerDialog.mode === 'create' ? '新建服务商' : '编辑服务商'}
              </h2>
              <button type="button" className="model-icon-button" aria-label="关闭" onClick={() => setProviderDialog(null)}>
                <Icon name="close" />
              </button>
            </header>

            <div className="model-form">
              <label className="model-field">
                <span>服务商名称</span>
                <input
                  value={providerForm.name}
                  placeholder="例如：DeepSeek（深度求索）"
                  onChange={(event) => setProviderForm((form) => ({ ...form, name: event.target.value }))}
                />
              </label>
              <label className="model-field">
                <span>默认 Base URL</span>
                <input
                  value={providerForm.defaultBaseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => setProviderForm((form) => ({ ...form, defaultBaseUrl: event.target.value }))}
                />
                <small>模型未填写独立地址时使用该地址</small>
              </label>
              <div className="model-field">
                <span>协议</span>
                <span className="model-readonly">OpenAI 兼容 Chat Completions</span>
              </div>

              {localError ?? formError ? (
                <div className="model-form-error">{localError ?? formError}</div>
              ) : null}
            </div>

            <footer>
              <button type="button" className="model-ghost" onClick={() => setProviderDialog(null)} disabled={savingProvider}>
                取消
              </button>
              <button
                type="button"
                className="model-primary"
                onClick={() => {
                  void submitProvider().catch((error: unknown) => setLocalError(errorMessage(error)));
                }}
                disabled={savingProvider}
              >
                {savingProvider ? '保存中…' : '保存'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
