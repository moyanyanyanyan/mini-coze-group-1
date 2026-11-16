import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PluginsView, type PluginsViewProps } from './PluginsView';
import { ToolTestView, type ToolTestViewProps } from './ToolTestView';

const noop = () => undefined;
const props: PluginsViewProps = {
  loading: false, error: null, query: '', category: 'all', filteredMarket: [],
  onQueryChange: noop, onCategoryChange: noop, onRetry: noop, onClearFilters: noop,
};
const toolProps: ToolTestViewProps = {
  tool: { pluginId: 'test', name: 'echo', description: '测试工具', parameters: {} },
  requiredKeys: ['text'], propertyEntries: [['text', { type: 'string' }]], values: { text: '示例' },
  state: { kind: 'idle' }, onValueChange: noop, handleRun: noop, onClose: noop,
};

describe('plugin views', () => {
  it('renders distinct loading, retry and empty-filter states', () => {
    const loading = renderToStaticMarkup(<PluginsView {...props} loading />);
    expect(loading).toContain('aria-label="正在加载插件"');
    expect(loading).not.toContain('清空筛选');
    const error = renderToStaticMarkup(<PluginsView {...props} error="目录错误" />);
    expect(error).toContain('加载失败：目录错误');
    expect(error).toContain('重试');
    expect(error).not.toContain('清空筛选');
    expect(renderToStaticMarkup(<PluginsView {...props} />)).toContain('清空筛选');
  });

  it('renders execution progress and server output supplied by the controller', () => {
    const pending = renderToStaticMarkup(<ToolTestView {...toolProps} state={{ kind: 'loading' }} />);
    expect(pending).toContain('value="示例"');
    expect(pending).toContain('pm-req');
    expect(pending).toMatch(/disabled="">执行中…/);
    const failed = renderToStaticMarkup(<ToolTestView {...toolProps}
      state={{ kind: 'success', status: 'failed', text: '{"message":"执行失败"}' }} />);
    expect(failed).toContain('pm-result is-failed');
    expect(failed).toContain('执行失败');
    expect(renderToStaticMarkup(<ToolTestView {...toolProps}
      state={{ kind: 'error', message: '请求错误' }} />)).toContain('pm-result is-error">请求错误');
  });
});
