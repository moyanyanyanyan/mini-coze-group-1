import { expect, it } from 'vitest';
import { groupConversations, searchConversations, UNCLASSIFIED_GROUP_ID } from './conversation-groups';

it('groups conversations by persisted agentId, including missing and unclassified agents', () => {
  const conversations = [
    { id: 'one', title: 'A', agentId: 'agent-a', updatedAt: '2026-01-01' },
    { id: 'two', title: 'B', agentId: 'agent-b', updatedAt: '2026-01-02' },
    { id: 'three', title: 'C', agentId: null, updatedAt: '2026-01-03' },
    { id: 'four', title: 'D', agentId: 'removed-agent', updatedAt: '2026-01-04' },
  ];
  const groups = groupConversations([
    { id: 'agent-a', name: '智能体 A' },
    { id: 'agent-b', name: '智能体 B' },
  ], conversations);

  expect(groups.map((group) => [group.id, group.conversations.map((item) => item.id)])).toEqual([
    ['agent-a', ['one']],
    ['agent-b', ['two']],
    [UNCLASSIFIED_GROUP_ID, ['three']],
    ['removed-agent', ['four']],
  ]);
  expect(searchConversations(groups, '智能体 B').map((result) => result.conversation.id)).toEqual(['two']);
  expect(searchConversations(groups, 'C').map((result) => result.group.id)).toEqual([UNCLASSIFIED_GROUP_ID]);
});
