import type {
  MarketPlugin,
  PluginAuthType,
  PluginCategory,
  PluginConnectionStatus,
  PluginKind,
} from './types';
import { getPluginIcon } from './plugin-icons';

export const CATEGORY_ORDER: PluginCategory[] = ['coding', 'office', 'external'];

export const CATEGORY_META: Record<PluginCategory, string> = {
  coding: '开发调试',
  office: '办公效率',
  external: '外部连接',
};

const STATUS_META: Record<PluginConnectionStatus, { label: string; tone: 'ok' | 'warn' | 'error' }> = {
  connected: { label: '已连接', tone: 'ok' },
  unknown: { label: '未连接', tone: 'warn' },
  error: { label: '连接异常', tone: 'error' },
};

const AUTH_LABEL: Record<PluginAuthType, string> = {
  none: '无需密钥',
  bearer: 'Bearer Token',
  api_key: 'API Key',
};

const KIND_LABEL: Record<PluginKind, string> = {
  builtin: '内置',
  http: 'HTTP',
  mcp: 'MCP',
};

type PluginCardProps = {
  plugin: MarketPlugin;
};

export function PluginCard({ plugin }: PluginCardProps) {
  const status = STATUS_META[plugin.connectionStatus ?? 'unknown'];
  const PluginIcon = getPluginIcon(plugin.iconKind);
  return (
    <article className="pm-card">
      <div className="pm-card-header">
        <span className="pm-card-icon">
          <PluginIcon />
        </span>
        <div className="pm-card-title-group">
          <h3>{plugin.name}</h3>
          <span className="pm-card-meta">{plugin.pluginId}</span>
        </div>
      </div>

      <div className="pm-card-badges">
        <span className={`pm-badge pm-badge-${status.tone}`}>{status.label}</span>
        <span className="pm-badge pm-badge-neutral">{KIND_LABEL[plugin.kind]}</span>
        <span className="pm-badge pm-badge-neutral">{AUTH_LABEL[plugin.authType]}</span>
      </div>

      <p className="pm-card-desc">{plugin.description}</p>

      {plugin.lastError ? (
        <p className="pm-card-error" role="alert">{plugin.lastError}</p>
      ) : null}

      <div className="pm-card-tools">
        {plugin.tools.map((tool) => (
          <div key={tool.name} className="pm-tool-row">
            <span className="pm-tool-name">{tool.name}</span>
            <span className="pm-tool-desc">{tool.description || '暂无说明'}</span>
          </div>
        ))}
      </div>

      {plugin.endpoint ? <p className="pm-card-endpoint">{plugin.endpoint}</p> : null}
    </article>
  );
}
