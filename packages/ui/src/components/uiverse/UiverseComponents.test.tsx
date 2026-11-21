import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PurpleGlassCard, SourcePagination, SourceAccordion, InfoTooltip, IconMenu } from './index';

describe('Uiverse 公共组件', () => {
  it('卡片保留五个圆片，动态内容转义且不内置社交占位操作', () => {
    const html = renderToStaticMarkup(<PurpleGlassCard title="<script>" description="说明" action={{ label: '打开', onClick: () => {} }} />);
    expect(html).toContain('&lt;script&gt;');
    expect(html.match(/class="uv-card-circle uv-card-circle[1-5]"/g)).toHaveLength(5);
    expect(html).not.toContain('UIVERSE (3D UI)');
    expect(html).not.toContain('class="uv-card-social-button"');
    expect(html).toContain('type="button"');
  });
  it('分页处理空总数、越界页码，大页数保持有限按钮', () => {
    const empty = renderToStaticMarkup(<SourcePagination page={-5} totalPages={0} onChange={() => {}} />);
    expect(empty.match(/disabled=""/g)).toHaveLength(2);
    expect(empty).toContain('aria-current="page">1');
    const large = renderToStaticMarkup(<SourcePagination page={999999} totalPages={1000000} onChange={() => {}} />);
    expect(large.match(/class="uv-marque-pager__page"/g)?.length).toBeLessThanOrEqual(5);
    expect(large).toContain('aria-label="第 999999 页" aria-current="page"');
    expect(large).not.toContain('NaN');
  });
  it('多组折叠的 ID 和 radio 组名互不冲突', () => {
    const items = [{ id: 'same', title: '标题', content: '内容' }];
    const html = renderToStaticMarkup(<><SourceAccordion items={items} value="same" onChange={() => {}} /><SourceAccordion items={items} value="same" onChange={() => {}} /></>);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const names = [...html.matchAll(/ name="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(names).size).toBe(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });
  it('提示层关联触发按钮，菜单保留禁用与选中语义', () => {
    const html = renderToStaticMarkup(<InfoTooltip label="说明" title="统计口径">仅统计已完成记录</InfoTooltip>);
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}" role="tooltip" aria-hidden="true"`);
    const menu = renderToStaticMarkup(<IconMenu label="筛选" selectedId="a" onSelect={() => {}} items={[{ id: 'a', label: '全部' }, { id: 'b', label: '禁用', disabled: true }]} />);
    expect(menu).toContain('aria-pressed="true"');
    expect(menu).toContain('disabled=""');
  });
});
