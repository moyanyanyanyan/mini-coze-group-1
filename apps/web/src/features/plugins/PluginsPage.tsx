import { useEffect, useMemo, useState } from "react";
import {
  fetchPluginCatalog,
  type PluginCatalogItem,
} from "./plugins.api";
import {
  PluginsView,
  type MarketPlugin,
  type PluginCategory,
} from "@minicoze/ui/plugins";

/** 内置插件 → 市场分类的展示映射（分类仅用于 UI 分组，不改后端契约） */
function categoryOf(pluginId: string): PluginCategory {
  if (pluginId === "plugin_echo") return "coding";
  if (pluginId === "plugin_web_reader") return "information";
  if (pluginId === "plugin_time") return "office";
  return "office";
}

function iconKindOf(pluginId: string): MarketPlugin["iconKind"] {
  if (pluginId === "plugin_time") return "time";
  if (pluginId === "plugin_calculator") return "calculator";
  if (pluginId === "plugin_web_reader") return "web";
  return "echo";
}

function toMarketPlugin(item: PluginCatalogItem): MarketPlugin {
  return {
    pluginId: item.pluginId,
    name: item.title,
    description: item.content,
    category: categoryOf(item.pluginId),
    iconKind: iconKindOf(item.pluginId),
    capabilities: [{ kind: "tool", count: item.tools.length }],
    limitedFree: false,
    connectRequired: false,
    installedCount: 0,
    tools: item.tools,
  };
}

export function PluginsPage() {
  const [catalog, setCatalog] = useState<PluginCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const [category, setCategory] = useState<PluginCategory | 'all'>('all');
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

  return (
    <PluginsView
      loading={loading}
      error={error}
      query={query}
      category={category}
      filteredMarket={filteredMarket}
      onQueryChange={setQuery}
      onCategoryChange={setCategory}
      onRetry={() => setReload((value) => value + 1)}
      onClearFilters={() => { setQuery(''); setCategory('all'); }}
    />
  );
}
