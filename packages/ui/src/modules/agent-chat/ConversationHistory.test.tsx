import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ConversationHistory } from './ConversationHistory';

it('renders separate agent groups, counts, and an unclassified group', () => {
  const markup = renderToStaticMarkup(<ConversationHistory
    agents={[{ id: 'agent-a', name: '智能体 A' }, { id: 'agent-b', name: '智能体 B' }]}
    conversations={[
      { id: 'one', title: '第一段对话', agentId: 'agent-a', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'two', title: '旧记录', agentId: null, updatedAt: '2026-01-02T00:00:00.000Z' },
    ]}
    conversationId="one" disabled={false} onSelect={() => {}} onDelete={() => {}}
    onRename={async () => true}
  />);

  expect(markup).toContain('智能体 A');
  expect(markup).toContain('智能体 B');
  expect(markup).toContain('未归类对话');
  expect(markup).toContain('第一段对话');
  expect(markup).toContain('1 条对话');
  expect(markup).toContain('0 条对话');
  expect(markup).toContain('aria-expanded="true"');
});
