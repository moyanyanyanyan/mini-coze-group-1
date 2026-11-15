import type { ReactNode } from 'react';
import type { ChatMessage } from '@minicoze/shared';
import { MarkdownMessage } from './MarkdownMessage';
import styles from '../agent-chat.module.css';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  // 是否还在生成只看 status，不能靠「内容为空」猜 —— 失败的消息内容也是空的
  const generating = message.status === 'running' || message.status === 'pending';
  const waiting = !isUser && generating && !message.content;

  let body: ReactNode = null;
  if (waiting) {
    body = (
      <>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.srOnly}>正在生成回答</span>
      </>
    );
  } else if (isUser) {
    body = message.content;
  } else if (message.content) {
    // 模型输出的是 markdown，这里渲染成排版，不再露出 ## / ** / 代码围栏这些源码
    body = <MarkdownMessage content={message.content} />;
  } else if (message.status === 'failed') {
    body = <span className={styles.bubbleHint}>生成失败，可以重新发送</span>;
  } else if (message.status === 'cancelled') {
    body = <span className={styles.bubbleHint}>已停止生成</span>;
  }

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : ''}`}>
      <div
        className={`${styles.avatar} ${isUser ? styles.avatarUser : styles.avatarAssistant}`}
        aria-hidden="true"
      >
        {isUser ? '我' : 'AI'}
      </div>
      <div
        className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
        aria-live={generating && !isUser ? 'polite' : undefined}
      >
        {body}
        {!waiting && message.status === 'cancelled' && message.content ? (
          <span className={styles.bubbleHint}>已停止</span>
        ) : null}
      </div>
    </div>
  );
}
