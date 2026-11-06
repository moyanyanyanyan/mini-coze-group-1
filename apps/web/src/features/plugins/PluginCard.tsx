import type { PluginToolDefinition } from "./plugins.api";
import { getPluginIcon } from './plugin-icons';

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

type PluginCardProps = {
  plugin: MarketPlugin;
};

export function PluginCard({ plugin }: PluginCardProps) {
  const PluginIcon = getPluginIcon(plugin.iconKind);
  return (
    <article className="pm-card">
      <div className="pm-card-head">
        <span className="pm-card-icon">
          <PluginIcon />
        </span>
        <div className="pm-card-copy">
          <div className="pm-card-title-row">
            <h3 className="pm-card-name">{plugin.name}</h3>
          </div>
        </div>
      </div>
      <p className="pm-card-desc">{plugin.description}</p>
      <footer className="pm-card-foot">
        <span className="pm-cap">工具 <b>{plugin.tools.length}</b></span>
        <span className="pm-plugin-kind">{CATEGORY_META[plugin.category]}</span>
      </footer>
      <details className="pm-technical"><summary>技术信息</summary><code>{plugin.pluginId}</code></details>
    </article>
  );
}
