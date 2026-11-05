import type { PluginToolDefinition } from "./plugins.api";

export type PluginCategory = "coding" | "office" | "information";

export type MarketPlugin = {
  pluginId: string;
  name: string;
  description: string;
  category: PluginCategory;
  iconKind: "echo" | "time" | string;
  capabilities: Array<{ kind: string; count: number }>;
  limitedFree: boolean;
  connectRequired: boolean;
  installedCount: number;
  tools: PluginToolDefinition[];
};

export const CATEGORY_ORDER: PluginCategory[] = [
  "coding",
  "office",
  "information",
];

export const CATEGORY_META: Record<PluginCategory, string> = {
  coding: "开发调试",
  office: "办公效率",
  information: "信息获取",
};

const PLUGIN_ICONS: Record<string, string> = {
  echo: "🔊",
  time: "🕐",
  calculator: "🧮",
  web: "🌐",
};

type PluginCardProps = {
  plugin: MarketPlugin;
};

export function PluginCard({ plugin }: PluginCardProps) {
  return (
    <article className="pm-card">
      <div className="pm-card-header">
        <span className="pm-card-icon">
          {PLUGIN_ICONS[plugin.iconKind] ?? "🧩"}
        </span>
        <div className="pm-card-title-group">
          <h3>{plugin.name}</h3>
          <span className="pm-card-meta">{plugin.pluginId}</span>
        </div>
      </div>
      <p className="pm-card-desc">{plugin.description}</p>
    </article>
  );
}
