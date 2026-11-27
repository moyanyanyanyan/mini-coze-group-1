import { useEffect, useMemo, useState } from 'react';
import { ActionMenu, Icon } from '../../components';
import { conversationGroupId, groupConversations, searchConversations } from './conversation-groups';
import type { ChatAgentOption, ChatConversationItem } from './types';
import styles from './agent-chat.module.css';

const EXPANDED_STORAGE_KEY = 'minicoze:conversation-groups:v1';

function savedExpandedGroups(): Record<string, boolean> {
  try {
    const value = sessionStorage.getItem(EXPANDED_STORAGE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

interface ConversationRowProps {
  conversation: ChatConversationItem;
  agentName?: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
}

function ConversationRow({ conversation, agentName, selected, disabled, onSelect, onDelete, onRename }: ConversationRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [saving, setSaving] = useState(false);
  const title = conversation.title || '新对话';

  return <div className={`${styles.conversationItem}${selected ? ` ${styles.conversationItemActive}` : ''}`}>
    {editing ? <form className={styles.conversationEdit} onSubmit={async (event) => {
      event.preventDefault();
      if (!draft.trim() || saving) return;
      setSaving(true);
      const saved = await onRename(conversation.id, draft.trim());
      setSaving(false);
      if (saved) setEditing(false);
    }}>
      <input autoFocus aria-label={`重命名会话 ${title}`} value={draft} maxLength={100}
        disabled={saving} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false); }} />
      <button type="submit" aria-label="保存名称" disabled={!draft.trim() || saving}><Icon name="check" /></button>
      <button type="button" aria-label="取消重命名" disabled={saving} onClick={() => setEditing(false)}><Icon name="close" /></button>
    </form> : <>
      <button type="button" className={styles.conversationSelect} disabled={disabled} aria-current={selected ? 'page' : undefined}
        onClick={() => onSelect(conversation.id)}>
        <span title={title}>{title}</span>
        {agentName && <small className={styles.conversationAgentName} title={agentName}>{agentName}</small>}
        <small>{new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}</small>
      </button>
      <ActionMenu floating label={`会话操作：${title}`}>
        <button type="button" disabled={disabled} onClick={() => { setDraft(conversation.title); setEditing(true); }}>
          重命名
        </button>
        <button type="button" className={styles.conversationDelete} disabled={disabled}
          aria-label={`删除会话 ${title}`} onClick={() => onDelete(conversation.id)}>
          删除对话
        </button>
      </ActionMenu>
    </>}
  </div>;
}

interface ConversationHistoryProps {
  conversations: ChatConversationItem[];
  agents: ChatAgentOption[];
  conversationId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
}

export function ConversationHistory({ conversations, agents, conversationId, disabled, onSelect, onDelete, onRename }: ConversationHistoryProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(savedExpandedGroups);
  const groups = useMemo(() => groupConversations(agents, conversations), [agents, conversations]);
  const selected = conversations.find((conversation) => conversation.id === conversationId);
  const selectedGroupId = selected ? conversationGroupId(selected) : null;
  const search = query.trim();
  const results = useMemo(() => searchConversations(groups, search), [groups, search]);

  useEffect(() => {
    if (selectedGroupId) setExpanded((previous) => ({ ...previous, [selectedGroupId]: true }));
  }, [conversationId, selectedGroupId]);

  useEffect(() => {
    try { sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded)); } catch { /* Storage may be unavailable. */ }
  }, [expanded]);

  const select = (id: string, groupId: string) => {
    setExpanded((previous) => ({ ...previous, [groupId]: true }));
    setQuery('');
    onSelect(id);
  };

  return <div className={styles.conversationList}>
    <input className={styles.historySearch} type="search" aria-label="搜索历史对话"
      placeholder="搜索历史对话" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className={styles.historyGroups}>
      {search ? <div className={styles.searchResults} aria-label="历史对话搜索结果">
        {results.length ? results.map(({ conversation, group }) => <ConversationRow key={conversation.id}
          conversation={conversation} agentName={group.name} selected={conversation.id === conversationId}
          disabled={disabled} onSelect={(id) => select(id, group.id)} onDelete={onDelete} onRename={onRename} />)
          : <p className={styles.historyEmpty}>没有找到匹配的对话</p>}
      </div> : groups.map((group, index) => {
        const open = expanded[group.id] ?? group.id === selectedGroupId;
        const panelId = `conversation-group-${index}`;
        return <section key={group.id} className={styles.historyGroup}>
          <button type="button" className={styles.historyGroupTrigger} aria-expanded={open} aria-controls={panelId}
            onClick={() => setExpanded((previous) => ({ ...previous, [group.id]: !open }))}>
            <span className={styles.historyGroupAvatar} aria-hidden="true">
              {group.avatarUrl ? <img src={group.avatarUrl} alt="" /> : group.name.slice(0, 1)}
            </span>
            <span className={styles.historyGroupName} title={group.name}>{group.name}</span>
            <span className={styles.historyGroupCount} aria-label={`${group.conversations.length} 条对话`}>{group.conversations.length}</span>
            <Icon name="chevronDown" className={`${styles.historyGroupChevron}${open ? ` ${styles.historyGroupChevronOpen}` : ''}`} />
          </button>
          <div id={panelId} className={`${styles.historyGroupPanel}${open ? ` ${styles.historyGroupPanelOpen}` : ''}`}
            aria-hidden={!open} inert={!open}>
            <div className={styles.historyGroupContent}>
              {group.conversations.length ? group.conversations.map((conversation) => <ConversationRow key={conversation.id}
                conversation={conversation} selected={conversation.id === conversationId} disabled={disabled}
                onSelect={(id) => select(id, group.id)} onDelete={onDelete} onRename={onRename} />)
                : <p className={styles.historyEmpty}>暂无历史对话</p>}
            </div>
          </div>
        </section>;
      })}
    </div>
  </div>;
}
