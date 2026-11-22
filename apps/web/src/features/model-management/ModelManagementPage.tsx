import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ModelManagementView,
  type ModelConfigInput,
  type ModelConfigListItem,
  type ModelFilters,
  type ModelProviderInput,
  type ModelProviderListItem,
} from '@minicoze/ui/model-management';
import { useConfirm } from '@minicoze/ui/hooks';
import {
  createModelConfig,
  createModelProvider,
  deleteModelConfig,
  deleteModelProvider,
  listModelConfigs,
  listModelProviders,
  updateModelConfig,
  updateModelConfigStatus,
  updateModelProvider,
} from './model-management.api';

const DEFAULT_FILTERS: ModelFilters = {
  keyword: '',
  providerId: '',
  status: 'all',
  type: 'all',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后再试';
}

export function ModelManagementPage() {
  const [activeTab, setActiveTab] = useState<'configs' | 'providers'>('configs');
  const [filters, setFilters] = useState<ModelFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [configs, setConfigs] = useState<ModelConfigListItem[]>([]);
  const [configsTotal, setConfigsTotal] = useState(0);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [configsError, setConfigsError] = useState<string | null>(null);

  const [providers, setProviders] = useState<ModelProviderListItem[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);

  const [savingConfig, setSavingConfig] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const configRequestId = useRef(0);
  const providerRequestId = useRef(0);
  const { confirm, confirmation } = useConfirm();

  const loadProviders = useCallback(async () => {
    const requestId = ++providerRequestId.current;
    setProvidersLoading(true);
    setProvidersError(null);
    try {
      const items = await listModelProviders();
      if (requestId === providerRequestId.current) {
        setProviders(items);
      }
    } catch (error) {
      if (requestId === providerRequestId.current) {
        setProvidersError(errorMessage(error));
      }
    } finally {
      if (requestId === providerRequestId.current) {
        setProvidersLoading(false);
      }
    }
  }, []);

  const loadConfigs = useCallback(async () => {
    const requestId = ++configRequestId.current;
    setConfigsLoading(true);
    setConfigsError(null);
    try {
      const result = await listModelConfigs({
        keyword: filters.keyword.trim() || undefined,
        providerId: filters.providerId || undefined,
        status: filters.status === 'all' ? undefined : filters.status,
        type: filters.type === 'all' ? undefined : filters.type,
        page,
        pageSize,
      });
      if (requestId === configRequestId.current) {
        setConfigs(result.items);
        setConfigsTotal(result.total);
      }
    } catch (error) {
      if (requestId === configRequestId.current) {
        setConfigsError(errorMessage(error));
      }
    } finally {
      if (requestId === configRequestId.current) {
        setConfigsLoading(false);
      }
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConfigs();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadConfigs]);

  function handleFiltersChange(patch: Partial<ModelFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }

  function handleResetFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  function handleTabChange(tab: 'configs' | 'providers') {
    setActiveTab(tab);
    setActionError(null);
    if (tab === 'providers') {
      void loadProviders();
    } else {
      void loadConfigs();
    }
  }

  async function handleSaveConfig(
    mode: 'create' | 'edit',
    id: string | null,
    input: ModelConfigInput,
  ): Promise<boolean> {
    setSavingConfig(true);
    setFormError(null);
    try {
      if (mode === 'create') {
        await createModelConfig({ ...input, apiKey: input.apiKey ?? '' });
      } else if (id) {
        await updateModelConfig(id, input);
      }
      await Promise.all([loadConfigs(), loadProviders()]);
      setActionError(null);
      return true;
    } catch (error) {
      setFormError(errorMessage(error));
      return false;
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleToggleConfig(item: ModelConfigListItem, enabled: boolean): Promise<void> {
    try {
      await updateModelConfigStatus(item.id, enabled);
      await loadConfigs();
      setActionError(null);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function handleDeleteConfig(item: ModelConfigListItem): Promise<void> {
    const accepted = await confirm(
      `确定删除模型「${item.name}」吗？已被 Agent 绑定的模型需要先解除绑定。`,
    );
    if (!accepted) {
      return;
    }
    try {
      await deleteModelConfig(item.id);
      if (page > 1 && configsTotal <= 1) {
        setPage(page - 1);
      } else {
        await loadConfigs();
      }
      await loadProviders();
      setActionError(null);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function handleSaveProvider(
    mode: 'create' | 'edit',
    id: string | null,
    input: ModelProviderInput,
  ): Promise<boolean> {
    setSavingProvider(true);
    setFormError(null);
    try {
      if (mode === 'create') {
        await createModelProvider(input);
      } else if (id) {
        await updateModelProvider(id, input);
      }
      await Promise.all([loadProviders(), loadConfigs()]);
      setActionError(null);
      return true;
    } catch (error) {
      setFormError(errorMessage(error));
      return false;
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleDeleteProvider(item: ModelProviderListItem): Promise<void> {
    const accepted = await confirm(
      `确定删除服务商「${item.name}」吗？该服务商下仍有 ${item.modelCount} 个模型时无法删除。`,
    );
    if (!accepted) {
      return;
    }
    try {
      await deleteModelProvider(item.id);
      await Promise.all([loadProviders(), loadConfigs()]);
      setActionError(null);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  return (
    <>
      <ModelManagementView
        activeTab={activeTab}
        onTabChange={handleTabChange}
        filters={filters}
        configs={configs}
        configsTotal={configsTotal}
        configsLoading={configsLoading}
        configsError={configsError}
        providers={providers}
        providersLoading={providersLoading}
        providersError={providersError}
        page={page}
        pageSize={pageSize}
        savingConfig={savingConfig}
        savingProvider={savingProvider}
        formError={formError}
        actionError={actionError}
        onDismissActionError={() => setActionError(null)}
        actions={{
          onFiltersChange: handleFiltersChange,
          onResetFilters: handleResetFilters,
          onPageChange: setPage,
          onPageSizeChange: (size: number) => {
            setPageSize(size);
            setPage(1);
          },
          onSaveConfig: handleSaveConfig,
          onToggleConfig: handleToggleConfig,
          onDeleteConfig: handleDeleteConfig,
          onSaveProvider: handleSaveProvider,
          onDeleteProvider: handleDeleteProvider,
          onClearFormError: () => setFormError(null),
        }}
      />
      {confirmation}
    </>
  );
}
