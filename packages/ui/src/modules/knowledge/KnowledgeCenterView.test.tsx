import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KnowledgeCenterView } from './KnowledgeCenterView';
import type { KnowledgeCenterViewProps } from './types';

const noop = () => undefined;

function props(): KnowledgeCenterViewProps {
  return {
    items: [], editingItem: null, loading: false, error: '', name: '', description: '', saving: false, creatingBase: false, canCreate: false,
    actions: { onToggleCreate: noop, onNameChange: noop, onDescriptionChange: noop, handleCreate: noop, onOpenDetail: noop, onOpenEdit: noop },
  };
}

describe('knowledge center view', () => {
  it('renders a useful empty state and create entry', () => {
    const html = renderToStaticMarkup(<KnowledgeCenterView {...props()} />);
    expect(html).toContain('还没有知识库');
    expect(html).toContain('创建第一个知识库');
    expect(html).not.toContain('knowledge-sidebar');
  });

  it('renders cards without fabricating document counts', () => {
    const input = props();
    input.items = [{ id: 'kb-1', name: '员工手册', description: '团队资料', status: 'ACTIVE' }];
    const html = renderToStaticMarkup(<KnowledgeCenterView {...input} />);
    expect(html).toContain('员工手册');
    expect(html).toContain('进入知识库');
    expect(html).not.toContain('份资料');
  });

  it('renders the create form as a modal dialog', () => {
    const input = props();
    input.creatingBase = true;
    input.canCreate = true;
    const html = renderToStaticMarkup(<KnowledgeCenterView {...input} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('关闭弹窗');
    expect(html).toContain('knowledge-modal-backdrop');
    expect(html).toContain('0 / 200');
  });

  it('keeps card actions focused on entering the knowledge base', () => {
    const input = props();
    input.items = [{ id: 'kb-1', name: '员工手册', description: '团队资料', status: 'ACTIVE' }];
    const html = renderToStaticMarkup(<KnowledgeCenterView {...input} />);
    expect(html).toContain('进入知识库');
    expect(html).not.toContain('编辑知识库');
  });

  it('keeps empty and long descriptions within the same card structure', () => {
    const input = props();
    input.items = [
      { id: 'empty', name: '空描述', description: '', status: 'ACTIVE' },
      { id: 'long', name: '很长的知识库名称很长的知识库名称很长的知识库名称', description: '连续英文和 URL https://example.com/a-very-long-resource-name-without-spaces 以及换行内容'.repeat(4), status: 'DISABLED' },
    ];
    const html = renderToStaticMarkup(<KnowledgeCenterView {...input} />);
    expect(html).toContain('未添加描述');
    expect(html).toContain('knowledge-base-card-description');
    expect(html).toContain('知识库名称很长');
  });
});
