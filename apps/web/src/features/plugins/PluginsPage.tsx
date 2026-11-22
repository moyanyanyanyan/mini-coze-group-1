import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AddPluginModal,
  PluginsView,
  type MarketPlugin,
  type PluginCategory,
} from '@minicoze/ui/plugins';
import {
  connectMcpPlugin,
  fetchPluginCatalog,
  savePlugin,
  slugifyPluginId,
  type PluginCatalogItem,
} from './plugins.api';

/** 内置插件 → 市场分类的展示映射（分类仅用于 UI 分组，不改后端契约） */
function categoryOf(item: PluginCatalogItem): PluginCategory {
  if (item.kind === 'mcp' || item.kind === 'http') return 'external';
  if (item.pluginId === 'plugin_echo') return 'coding';
  return 'office';
}

function iconKindOf(item: PluginCatalogItem): MarketPlugin['iconKind'] {
  if (item.kind === 'mcp' || item.kind === 'http') return 'globe';
  if (item.pluginId === 'plugin_time') return 'time';
  if (item.pluginId === 'plugin_calculator') return 'calculator';
  if (item.pluginId === 'plugin_web_reader') return 'web';
  return 'echo';
}

function toMarketPlugin(item: PluginCatalogItem): MarketPlugin {
  const kind = item.kind ?? 'builtin';
  return {
    pluginId: item.pluginId,
    name: item.title,
    description: item.content,
    category: categoryOf(item),
    iconKind: iconKindOf(item),
    kind,
    authType: item.authType ?? 'none',
    connectionStatus: item.connectionStatus ?? (kind === 'builtin' ? 'connected' : 'unknown'),
    lastError: item.lastError,
    endpoint: item.endpoint,
    tools: item.tools,
  };
}

export function PluginsPage() {
  const [catalog, setCatalog] = useState<PluginCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PluginCategory | 'all'>('all');
  const [reload, setReload] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPluginCatalog()
      .then((items) => {
        if (!cancelled) {
          setCatalog(items);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => () => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
  }, []);

  const market = useMemo(() => catalog.map(toMarketPlugin), [catalog]);

  const filteredMarket = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return market.filter((plugin) => {
      const matchesCategory = category === 'all' || plugin.category === category;
      const matchesQuery = !keyword
        || plugin.name.toLowerCase().includes(keyword)
        || plugin.description.toLowerCase().includes(keyword)
        || plugin.pluginId.toLowerCase().includes(keyword);
      return matchesCategory && matchesQuery;
    });
  }, [category, market, query]);

  return (
    <>
      <PluginsView
        loading={loading}
        error={error}
        query={query}
        category={category}
        filteredMarket={filteredMarket}
        onQueryChange={setQuery}
        onCategoryChange={setCategory}
        onRetry={() => setReload((value) => value + 1)}
        onClearFilters={() => {
          setQuery('');
          setCategory('all');
        }}
        onOpenAdd={() => setAddOpen(true)}
        toast={toast}
      />

      {addOpen ? (
        <AddPluginModal
          onClose={() => setAddOpen(false)}
          onSaved={() => setReload((value) => value + 1)}
          onNotify={notify}
          onConnect={(input) => connectMcpPlugin(input)}
          onSave={async (draft) => {
            const saved = await savePlugin({
              pluginId: slugifyPluginId(draft.title),
              title: draft.title,
              content: draft.serverName
                ? `来自远端服务 ${draft.serverName} 的 MCP 插件。`
                : `远程 MCP 插件：${draft.endpoint}`,
              tags: ['远程', 'MCP'],
              kind: 'mcp',
              endpoint: draft.endpoint,
              authType: draft.authType,
              authCredential: draft.authCredential,
              tools: draft.tools,
            });
            return { pluginId: saved.pluginId, title: saved.title };
          }}
        />
      ) : null}
    </>
  );
}
