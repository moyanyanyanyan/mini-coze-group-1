import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '@minicoze/shared';
import { MarkdownMessage } from './MarkdownMessage';
import styles from '../agent-chat.module.css';

interface ChatBubbleProps {
  message: ChatMessage;
  phase?: 'connecting' | 'thinking' | 'generating';
  onRetry?: () => void;
}

const THINKING_LABELS = ['正在思考...', '正在分析你的问题...', '正在组织回答...'];

function ThinkingIndicator({ phase }: { phase: 'connecting' | 'thinking' }) {
  const [labelIndex, setLabelIndex] = useState(0);

  useEffect(() => {
    if (phase !== 'thinking') return;
    const timer = window.setInterval(() => setLabelIndex((index) => (index + 1) % THINKING_LABELS.length), 2400);
    return () => window.clearInterval(timer);
  }, [phase]);

  return <span className={styles.thinking} role="status">
    <span>{phase === 'connecting' ? '正在连接...' : THINKING_LABELS[labelIndex]}</span>
    <span className={styles.thinkingDots} aria-hidden="true"><span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} /></span>
  </span>;
}

export const ChatBubble = memo(function ChatBubble({ message, phase, onRetry }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  // 是否还在生成只看 status，不能靠「内容为空」猜 —— 失败的消息内容也是空的
  const generating = phase !== undefined && (message.status === 'running' || message.status === 'pending');
  const waiting = !isUser && generating && !message.content;

  let body: ReactNode = null;
  if (waiting) {
    body = <ThinkingIndicator phase={phase === 'connecting' ? 'connecting' : 'thinking'} />;
  } else if (isUser) {
    body = message.content;
  } else if (message.content) {
    // 模型输出的是 markdown，这里渲染成排版，不再露出 ## / ** / 代码围栏这些源码
    body = <MarkdownMessage content={message.content} />;
  } else if (message.status === 'failed') {
    body = <span className={styles.bubbleHint}>生成失败，可以重新发送</span>;
  } else if (message.status === 'pending' || message.status === 'running') {
    body = <span className={styles.bubbleHint}>生成已中断，请重试发送</span>;
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
      <div className={styles.bubbleColumn}>
        <div
          className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
          aria-live={generating && !isUser ? 'polite' : undefined}
        >
          {body}
          {!isUser && generating && message.content ? <span className={styles.generationCursor} aria-label="正在生成" /> : null}
          {!waiting && message.status === 'cancelled' && message.content ? <span className={styles.bubbleHint}>已停止</span> : null}
          {!waiting && message.status === 'failed' && message.content ? <span className={styles.bubbleHint}>生成中断，请重新发送</span> : null}
          {!generating && (message.status === 'pending' || message.status === 'running') && message.content ? <span className={styles.bubbleHint}>生成已中断</span> : null}
        </div>
        {!isUser && (message.status === 'failed' || (!generating && (message.status === 'pending' || message.status === 'running'))) && onRetry ? (
          <button className={styles.retry} type="button" onClick={onRetry}>重试发送</button>
        ) : null}
        {!isUser && message.content && !generating ? (
          <div className={styles.messageActions}>
            <button
              type="button"
              onClick={() => {
                if (!navigator.clipboard?.writeText) return;
                void navigator.clipboard.writeText(message.content)
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  })
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? '已复制' : '复制回答'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
