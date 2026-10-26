import type { PluginCatalogItem } from '../types/plugin-tool';

/**
 * 内置插件目录（week2 仅内置 echo / time 两个插件，不做持久化）。
 * tools[].parameters 与 registry 中注册的工具定义同源，根 Schema 均带 additionalProperties: false。
 */
export const BUILTIN_PLUGIN_CATALOG: PluginCatalogItem[] = [
  {
    id: 1,
    pluginId: 'plugin_echo',
    title: '文本回显',
    content: '把输入文本原样回显，并记录提交时间。适合调试插件链路与参数传递。',
    icon: 'echo',
    tags: ['内置', '调试'],
    configSchema: {},
    // tools 在 registry 中按工具名注册后由 registry 组装，这里仅保留目录元信息
    tools: [],
  },
  {
    id: 2,
    pluginId: 'plugin_time',
    title: '当前时间',
    content: '返回服务器当前时间，可按 IANA 时区格式化。常用于让 Agent 获取实时时间。',
    icon: 'clock',
    tags: ['内置', '时间'],
    configSchema: {},
    tools: [],
  },
];
