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
    <section className="feature-page plugins-page" aria-label="插件市场">
      <header className="pm-header">
        <div className="pm-header-inner">
          <div>
            <h1>插件</h1>
            <p>浏览内置能力，在智能体编辑页选择并绑定使用。</p>
          </div>
        </div>
      </header>

      <main className="pm-main">
        <div className="pm-toolbar">
          <input
            className="pm-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索插件名称或能力"
            aria-label="搜索插件"
          />
          <div className="pm-filters" aria-label="插件分类">
            <button type="button" className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')}>全部</button>
            {CATEGORY_ORDER.map((item) => (
              <button key={item} type="button" className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>
                {CATEGORY_META[item]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="pm-grid pm-skeleton-grid" aria-label="正在加载插件">
            {Array.from({ length: 6 }, (_, index) => <div className="pm-skeleton" key={index} />)}
          </div>
        ) : null}
        {error ? (
          <p className="pm-status pm-status-error">加载失败：{error} <button onClick={() => setReload((value) => value + 1)}>重试</button></p>
        ) : null}
        {!loading && !error && filteredMarket.length === 0 ? (
          <div className="pm-empty">
            <strong>没有找到匹配的插件</strong>
            <span>调整搜索词或分类后再试。</span>
            <button onClick={() => { setQuery(''); setCategory('all'); }}>清空筛选</button>
          </div>
        ) : null}

        {!loading &&
          !error &&
          (
              <section className="pm-section" aria-label="插件列表">
                <div className="pm-grid">
                  {filteredMarket.map((plugin) => (
                    <PluginCard
                      key={plugin.pluginId}
                      plugin={plugin}
                    />
                  ))}
                </div>
              </section>
            )}
      </main>

    </section>
  );
}
