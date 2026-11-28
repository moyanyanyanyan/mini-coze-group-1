/**
 * 插件模块 UI 视图模型（纯展示层，不包含任何网络请求）。
 * 后端契约类型由 apps/web/features/plugins/plugins.api.ts 维护，
 * 页面编排层负责把目录数据映射为这里的 MarketPlugin。
 */

export type PluginAuthType = 'none' | 'bearer' | 'api_key';
export type PluginKind = 'builtin' | 'http' | 'mcp';
export type PluginConnectionStatus = 'unknown' | 'connected' | 'error';

export interface PluginToolView {
  pluginId: string;
  name: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export type PluginCategory = 'coding' | 'office' | 'external';

export type PluginIconKind = 'echo' | 'time' | 'globe' | 'calculator' | 'web' | string;

export interface MarketPlugin {
  pluginId: string;
  name: string;
  description: string;
  category: PluginCategory;
  iconKind: PluginIconKind;
  kind: PluginKind;
  authType: PluginAuthType;
  connectionStatus: PluginConnectionStatus;
  lastError?: string | null;
  endpoint?: string | null;
  tools: PluginToolView[];
}

/** 远端 MCP 探测返回的候选工具（视图层）。 */
export interface ProbedMcpTool {
  name: string;
  description: string;
  parameters: PluginToolView['parameters'];
}

/** 远端 MCP 探测结果（视图层）。 */
export interface ConnectMcpResultView {
  endpoint: string;
  title: string;
  serverName: string | null;
  authType: PluginAuthType;
  tools: ProbedMcpTool[];
}

/** 弹窗“连接并获取工具”提交的输入（由页面编排层注入的回调消费）。 */
export interface ConnectMcpInputView {
  endpoint: string;
  authType: PluginAuthType;
  authCredential?: string;
  title?: string;
}

/** 弹窗“保存插件”提交的草稿；pluginId/内容描述由编排层补全。 */
export interface SavePluginDraftView {
  title: string;
  endpoint: string;
  serverName?: string | null;
  authType: PluginAuthType;
  authCredential?: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: PluginToolView['parameters'];
  }>;
}

/** 保存成功后回传给页面的最小信息。 */
export interface SavedPluginView {
  pluginId: string;
  title: string;
}
