import type { ChatAgentOption, ChatConversationItem } from './types';

export const UNCLASSIFIED_GROUP_ID = '__unclassified__';

export interface ConversationGroup {
  id: string;
  name: string;
  avatarUrl?: string;
  conversations: ChatConversationItem[];
}

export interface ConversationSearchResult {
  conversation: ChatConversationItem;
  group: ConversationGroup;
}

export function conversationGroupId(conversation: ChatConversationItem): string {
  return conversation.agentId || UNCLASSIFIED_GROUP_ID;
}

export function groupConversations(
  agents: readonly ChatAgentOption[],
  conversations: readonly ChatConversationItem[],
): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();
  for (const agent of agents) {
    groups.set(agent.id, {
      id: agent.id,
      name: agent.name,
      avatarUrl: agent.avatarUrl,
      conversations: [],
    });
  }

  for (const conversation of conversations) {
    const id = conversationGroupId(conversation);
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        name: id === UNCLASSIFIED_GROUP_ID ? '未归类对话' : `已删除的智能体 (${id.slice(0, 6)})`,
        conversations: [],
      };
      groups.set(id, group);
    }
    group.conversations.push(conversation);
  }

  return [...groups.values()];
}

export function searchConversations(groups: readonly ConversationGroup[], query: string): ConversationSearchResult[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return [];
  return groups.flatMap((group) => group.conversations
    .filter((conversation) => conversation.title.toLocaleLowerCase().includes(search)
      || group.name.toLocaleLowerCase().includes(search))
    .map((conversation) => ({ conversation, group })));
}
