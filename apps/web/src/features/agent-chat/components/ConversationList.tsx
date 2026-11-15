import type { ConversationSummary } from '@minicoze/shared';
import { Icon } from '../../../shared/ui/Icon';
import styles from '../agent-chat.module.css';

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  agentNames: Record<string, string>;
  disabled: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (conversation: ConversationSummary) => void;
}

/** 今天显示时间，昨天显示「昨天」，更早显示月/日 */
function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function ConversationList({
  conversations,
  activeId,
  agentNames,
  disabled,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  return (
    <aside className={styles.history} aria-label="历史对话">
      <div className={styles.historyHead}>
        <span className={styles.historyTitle}>历史对话</span>
        <button
          type="button"
          className={styles.historyNew}
          onClick={onCreate}
          disabled={disabled}
          title="新建对话"
        >
          <Icon name="plus" />
          <span>新建</span>
        </button>
      </div>

      <div className={styles.historyList}>
        {conversations.length === 0 ? (
          <p className={styles.historyEmpty}>
            还没有对话。
            <br />
            发第一条消息后会自动出现在这里。
          </p>
        ) : (
          conversations.map((item) => {
            const active = item.id === activeId;
            return (
              <div
                key={item.id}
                className={`${styles.historyItem}${active ? ` ${styles.historyItemActive}` : ''}`}
              >
                <button
                  type="button"
                  className={styles.historyOpen}
                  onClick={() => onSelect(item.id)}
                  disabled={disabled}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={styles.historyName}>{item.title || '新对话'}</span>
                  <span className={styles.historyMeta}>
                    <span className={styles.historyAgent}>
                      {item.agentId ? agentNames[item.agentId] ?? '' : ''}
                    </span>
                    <span className={styles.historyTime}>{formatTime(item.updatedAt)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.historyDelete}
                  onClick={() => onDelete(item)}
                  disabled={disabled}
                  aria-label={`删除对话：${item.title || '新对话'}`}
                  title="删除"
                >
                  <Icon name="trash" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
