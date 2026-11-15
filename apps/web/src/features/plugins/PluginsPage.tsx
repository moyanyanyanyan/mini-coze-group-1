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
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const market = useMemo(() => catalog.map(toMarketPlugin), [catalog]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadCatalog = useCallback(() => {
    fetchPluginCatalog()
      .then((items) => {
        setCatalog(items);
        setLoading(false);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
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
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const handleSaved = () => {
    loadCatalog();
  };

  return (
    <>
      <PluginsView
        loading={loading}
        error={error}
        market={market}
        toast={toast}
        onOpenAdd={() => setAddOpen(true)}
      />
      {addOpen ? (
        <AddPluginModal
          onClose={() => setAddOpen(false)}
          onSaved={handleSaved}
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
