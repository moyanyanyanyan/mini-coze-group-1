import type { ChatMessage } from '@minicoze/shared';
import styles from '../agent-chat.module.css';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  // 还没收到第一个 delta 之前，气泡里只有跳动的点
  const waiting = !isUser && !message.content;

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : ''}`}>
      <div
        className={`${styles.avatar} ${isUser ? styles.avatarUser : styles.avatarAssistant}`}
        aria-hidden="true"
      >
        {isUser ? '我' : 'AI'}
      </div>
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
        {waiting ? (
          <>
            <span className={styles.dot} />
            <span className={styles.srOnly}>正在生成回答</span>
          </>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}
