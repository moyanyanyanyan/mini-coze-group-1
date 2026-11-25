import type { ChatMessageView } from './types';
import styles from './agent-chat.module.css';

interface ChatBubbleProps {
  message: ChatMessageView;
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
        {isUser && message.attachments?.length ? (
          <div className={styles.bubbleAttachments}>
            {message.attachments.map((attachment) => (
              <span
                key={attachment.id}
                className={`${styles.bubbleAttachment}${attachment.status === 'FAILED' ? ` ${styles.bubbleAttachmentFailed}` : ''}`}
                title={attachment.status === 'FAILED' ? attachment.errorCode ?? '解析失败' : attachment.fileName}
              >
                {attachment.fileName} · {formatFileSize(attachment.byteSize)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
