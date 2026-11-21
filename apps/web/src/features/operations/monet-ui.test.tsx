import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnchorHTMLAttributes } from 'react';
import { StorageRing } from '../../../../../packages/ui/src/modules/operations/KnowledgeWorkspace';

function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={to} {...props} />;
}
const items = [{ id: 'one', name: '文件一', value: 1 }, { id: 'two', name: '文件二', value: 2 }];

describe('容量环图的视觉交互边界', () => {
  it('环段保留完整比例，六色高光不改变容量', () => {
    const html = renderToStaticMarkup(<StorageRing items={items} label="容量" LinkComponent={Link} sample={false} />);
    const arcs = [...html.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)];
    expect(arcs).toHaveLength(2);
    expect(arcs.reduce((sum, arc) => sum + Number(arc[1]), 0)).toBeCloseTo(100);
    expect(html).toContain('66.7%');
    expect(html).toContain('33.3%');
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('tabindex="0"');
  });
  it('筛选环段提供键盘入口，聚合的其他分组保持只读', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({ id: String(index), name: `文件${index}`, value: index + 1 }));
    const html = renderToStaticMarkup(<StorageRing items={many} label="容量" LinkComponent={Link} onSelect={() => {}} />);
    expect((html.match(/role="button"/g) ?? []).length).toBe(5);
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(5);
    expect(html).not.toContain('aria-label="筛选其他');
    expect(html).toContain('其他 3 项');
  });
  it('空容量不生成无效环段，紧凑模式仍标识示例', () => {
    const empty = renderToStaticMarkup(<StorageRing items={[{ id: 'zero', name: '空文件', value: 0 }]} label="容量" LinkComponent={Link} />);
    expect(empty).not.toContain('NaN');
    expect(empty).not.toContain('stroke-dasharray');
    expect(empty).toContain('暂无可统计的文件');
    const compact = renderToStaticMarkup(<StorageRing items={items} compact label="容量" LinkComponent={Link} />);
    expect(compact).toContain('示例容量');
  });
});
