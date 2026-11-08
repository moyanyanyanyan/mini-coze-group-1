import type { ChatMessage } from '@minicoze/shared';
import styles from '../agent-chat.module.css';

interface ChatBubbleProps {
  message: ChatMessage;
  agentName?: string;
  avatarUrl?: string;
}

export function ChatBubble({ message, agentName, avatarUrl }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  // 还没收到第一个 delta 之前，气泡里只有跳动的点
  const waiting = !isUser && !message.content && message.status === 'running';

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : ''}`}>
      {!isUser && <div
        className={`${styles.avatar} ${isUser ? styles.avatarUser : styles.avatarAssistant}`}
        aria-hidden="true"
      >
        {avatarUrl ? <img src={avatarUrl} alt="" /> : agentName?.slice(0, 1) || '助'}
      </div>}
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
        {waiting ? (
          <>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.srOnly}>正在生成回答</span>
          </>
        ) : (
          message.content || '未收到回复，请重试。'
        )}
      </div>
    </div>
  );
}
