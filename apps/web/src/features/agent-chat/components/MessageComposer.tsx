import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import styles from '../agent-chat.module.css';

interface MessageComposerProps {
  disabled: boolean;
  onSend: (content: string) => void;
}

export function MessageComposer({ disabled, onSend }: MessageComposerProps) {
  const [draft, setDraft] = useState('');

  const send = () => {
    const content = draft.trim();
    // 纯空格不算一条消息，直接吃掉
    if (!content || disabled) {
      return;
    }
    onSend(content);
    setDraft('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  // Enter 发送，Shift+Enter 换行（这是聊天输入框的通用手感）
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        className={styles.textarea}
        value={draft}
        placeholder={disabled ? '会话还没准备好…' : '说点什么，Enter 发送 / Shift+Enter 换行'}
        rows={1}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button className={styles.send} type="submit" disabled={disabled || draft.trim().length === 0}>
        发送
      </button>
    </form>
  );
}
