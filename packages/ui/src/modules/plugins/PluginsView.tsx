import { CATEGORY_META, CATEGORY_ORDER, PluginCard } from './PluginCard';
import type { MarketPlugin } from './types';
import { LinkIcon } from './plugin-icons';
import './plugins.css';

export interface PluginsViewProps {
  loading: boolean;
  error: string | null;
  market: MarketPlugin[];
  toast: string | null;
  onOpenAdd: () => void;
}

export function PluginsView({ loading, error, market, toast, onOpenAdd }: PluginsViewProps) {
  return (
    <section className="feature-page plugins-page" aria-label="插件市场">
      <header className="pm-header">
        <div className="pm-header-inner">
          <span className="pm-header-brand">插件</span>
          <div className="pm-header-actions">
            <button
              type="button"
              className="pm-button pm-button-primary pm-button-header"
              onClick={onOpenAdd}
            >
              <LinkIcon />
              通过 URL 添加插件
            </button>
          </div>
        </div>
      </header>

      <main className="pm-main">
        {loading ? <p className="pm-status">加载插件目录中…</p> : null}
        {error ? <p className="pm-status pm-status-error">加载失败：{error}</p> : null}
        {!loading && !error && market.length === 0 ? (
          <p className="pm-status">当前没有可用插件，点击右上角「通过 URL 添加插件」接入远程 MCP 服务。</p>
        ) : null}

        {!loading &&
          !error &&
          CATEGORY_ORDER.map((category) => {
            const plugins = market.filter((plugin) => plugin.category === category);
            if (plugins.length === 0) return null;
            return (
              <section key={category} className="pm-section">
                <h2>{CATEGORY_META[category]}</h2>
                <div className="pm-grid">
                  {plugins.map((plugin) => (
                    <PluginCard key={plugin.pluginId} plugin={plugin} />
                  ))}
                </div>
              </section>
            );
          })}
      </main>

      {toast ? <div className="pm-toast" role="status">{toast}</div> : null}
    </section>
  );
}
