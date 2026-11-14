import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KnowledgeCenterView } from './KnowledgeCenterView';
import type { KnowledgeCenterViewProps } from './types';

const noop = () => undefined;

function props(): KnowledgeCenterViewProps {
  return {
    items: [], loading: false, error: '', name: '', description: '', saving: false, creatingBase: false, canCreate: false,
    actions: { onToggleCreate: noop, onNameChange: noop, onDescriptionChange: noop, handleCreate: noop, onOpenDetail: noop },
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
});
