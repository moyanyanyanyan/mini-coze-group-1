export type ModelConfigType = 'CHAT' | 'EMBEDDING';
export type ModelStatusFilter = 'all' | 'enabled' | 'disabled';
export type ModelTypeFilter = 'all' | ModelConfigType;

export interface ModelConfigListItem {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  modelIdentifier: string;
  type: ModelConfigType;
  dimension: number | null;
  baseUrl: string | null;
  effectiveBaseUrl: string;
  maskedKey: string;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'OK' | 'FAILED' | null;
  lastTestLatencyMs: number | null;
  lastTestErrorType: string | null;
}

export interface ModelPreset {
  identifier: string;
  label: string;
  type: ModelConfigType;
  dimension?: number;
}

export interface ModelProviderListItem {
  id: string;
  name: string;
  protocol: string;
  defaultBaseUrl: string;
  builtinKey: string | null;
  modelCount: number;
  /** 内置服务商的预置模型；自建服务商为空，由用户手填模型标识。 */
  presetModels?: ModelPreset[];
}

export interface ModelConfigPage {
  items: ModelConfigListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ModelConfigInput {
  providerId: string;
  name: string;
  modelIdentifier: string;
  type: ModelConfigType;
  dimension?: number | null;
  baseUrl?: string | null;
  /** 编辑时留空表示不修改已有 Key */
  apiKey?: string;
}

export interface ModelProviderInput {
  name: string;
  defaultBaseUrl: string;
}

export interface ModelFilters {
  keyword: string;
  providerId: string;
  status: ModelStatusFilter;
  type: ModelTypeFilter;
}

export interface ModelManagementActions {
  onFiltersChange: (patch: Partial<ModelFilters>) => void;
  onResetFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSaveConfig: (
    mode: 'create' | 'edit',
    id: string | null,
    input: ModelConfigInput,
  ) => Promise<boolean>;
  onToggleConfig: (item: ModelConfigListItem, enabled: boolean) => Promise<void>;
  onDeleteConfig: (item: ModelConfigListItem) => Promise<void>;
  onSaveProvider: (
    mode: 'create' | 'edit',
    id: string | null,
    input: ModelProviderInput,
  ) => Promise<boolean>;
  onDeleteProvider: (item: ModelProviderListItem) => Promise<void>;
  onClearFormError: () => void;
}

export interface ModelManagementViewProps {
  activeTab: 'configs' | 'providers';
  onTabChange: (tab: 'configs' | 'providers') => void;
  filters: ModelFilters;
  configs: ModelConfigListItem[];
  configsTotal: number;
  configsLoading: boolean;
  configsError: string | null;
  providers: ModelProviderListItem[];
  providersLoading: boolean;
  providersError: string | null;
  page: number;
  pageSize: number;
  savingConfig: boolean;
  savingProvider: boolean;
  formError: string | null;
  actionError: string | null;
  onDismissActionError: () => void;
  actions: ModelManagementActions;
}
