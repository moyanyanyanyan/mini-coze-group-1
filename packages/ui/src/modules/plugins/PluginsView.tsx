import { CATEGORY_META, CATEGORY_ORDER, PluginCard, type MarketPlugin, type PluginCategory } from './PluginCard';
import './plugins.css';

export interface PluginsViewProps {
  loading: boolean;
  error: string | null;
  query: string;
  category: PluginCategory | 'all';
  filteredMarket: MarketPlugin[];
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: PluginCategory | 'all') => void;
  onRetry: () => void;
  onClearFilters: () => void;
}

export function PluginsView({
  loading, error, query, category, filteredMarket, onQueryChange, onCategoryChange, onRetry, onClearFilters,
}: PluginsViewProps) {
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
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索插件名称或能力"
            aria-label="搜索插件"
          />
          <div className="pm-filters" aria-label="插件分类">
            <button type="button" className={category === 'all' ? 'is-active' : ''} onClick={() => onCategoryChange('all')}>全部</button>
            {CATEGORY_ORDER.map((item) => (
              <button key={item} type="button" className={category === item ? 'is-active' : ''} onClick={() => onCategoryChange(item)}>
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
          <p className="pm-status pm-status-error">加载失败：{error} <button onClick={() => onRetry()}>重试</button></p>
        ) : null}
        {!loading && !error && filteredMarket.length === 0 ? (
          <div className="pm-empty">
            <strong>没有找到匹配的插件</strong>
            <span>调整搜索词或分类后再试。</span>
            <button onClick={() => { onClearFilters(); }}>清空筛选</button>
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
