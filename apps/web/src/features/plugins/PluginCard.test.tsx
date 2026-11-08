import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PluginCard } from './PluginCard';

it('MVP 插件卡片保留信息，不提供直接测试入口', () => {
  const markup = renderToStaticMarkup(<PluginCard plugin={{
    pluginId: 'plugin_echo', name: '文本回显', description: '回显文本',
    category: 'coding', iconKind: 'echo', capabilities: [], limitedFree: false,
    connectRequired: false, installedCount: 0,
    tools: [{ pluginId: 'plugin_echo', name: 'echo_text', description: 'echo', parameters: {} }],
  }} />);
  expect(markup).toContain('文本回显');
  expect(markup).toContain('<summary>查看 1 个工具</summary>');
  expect(markup).toContain('<li>echo_text</li>');
  expect(markup).toContain('<svg');
  expect(markup).not.toContain('<button');
  expect(markup).not.toContain('测试');
});
