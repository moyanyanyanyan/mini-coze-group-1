import { useEffect, useMemo, useState } from "react";
import {
  fetchPluginCatalog,
  type PluginCatalogItem,
} from "./plugins.api";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  PluginCard,
  type MarketPlugin,
  type PluginCategory,
} from "./PluginCard";
import "./plugins.css";

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
  const market = useMemo(() => catalog.map(toMarketPlugin), [catalog]);

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
    };
  }, []);

  return (
    <section className="feature-page plugins-page" aria-label="插件市场">
      <header className="pm-header">
        <div className="pm-header-inner">
          <span className="pm-header-brand">插件</span>
        </div>
      </header>

      <main className="pm-main">
        {loading ? <p className="pm-status">加载插件目录中…</p> : null}
        {error ? (
          <p className="pm-status pm-status-error">加载失败：{error}</p>
        ) : null}
        {!loading && !error && market.length === 0 ? (
          <p className="pm-status">当前没有可用插件。</p>
        ) : null}

        {!loading &&
          !error &&
          CATEGORY_ORDER.map((category) => {
            const plugins = market.filter(
              (plugin) => plugin.category === category,
            );
            if (plugins.length === 0) return null;
            return (
              <section key={category} className="pm-section">
                <h2>{CATEGORY_META[category]}</h2>
                <div className="pm-grid">
                  {plugins.map((plugin) => (
                    <PluginCard
                      key={plugin.pluginId}
                      plugin={plugin}
                    />
                  ))}
                </div>
              </section>
            );
          })}
      </main>

    </section>
  );
}
