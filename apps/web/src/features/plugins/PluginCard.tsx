import type { PluginToolDefinition } from './plugins.api';

export type PluginCategory = 'coding' | 'office';

export type MarketPlugin = {
  pluginId: string;
  name: string;
  description: string;
  category: PluginCategory;
  iconKind: 'echo' | 'time' | string;
  capabilities: Array<{ kind: string; count: number }>;
  limitedFree: boolean;
  connectRequired: boolean;
  installedCount: number;
  tools: PluginToolDefinition[];
};

export const CATEGORY_ORDER: PluginCategory[] = ['coding', 'office'];

export const CATEGORY_META: Record<PluginCategory, string> = {
  coding: '开发调试',
  office: '办公效率',
};

type PluginCardProps = {
  plugin: MarketPlugin;
  onNotify: (message: string) => void;
  onTestTool: (tool: PluginToolDefinition) => void;
};

export function PluginCard({ plugin, onNotify, onTestTool }: PluginCardProps) {
  return (
    <article className="pm-card">
      <div className="pm-card-header">
        <span className="pm-card-icon">{plugin.iconKind === 'time' ? '🕐' : '🔊'}</span>
        <div className="pm-card-title-group">
          <h3>{plugin.name}</h3>
          <span className="pm-card-meta">{plugin.pluginId}</span>
        </div>
      </div>
      <p className="pm-card-desc">{plugin.description}</p>
      <div className="pm-card-tools">
        {plugin.tools.map((tool) => (
          <button
            key={tool.name}
            type="button"
            className="pm-button pm-button-sm"
            onClick={() => onTestTool(tool)}
          >
            测试 {tool.name}
          </button>
        ))}
      </div>
    </article>
  );
}
