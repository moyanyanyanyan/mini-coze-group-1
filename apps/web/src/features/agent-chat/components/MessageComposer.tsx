import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Icon } from '../../../shared/ui/Icon';
import styles from '../agent-chat.module.css';

interface MessageComposerProps {
  disabled: boolean;
  onSend: (content: string) => void;
}

export function MessageComposer({ disabled, onSend }: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft]);

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
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={draft}
        placeholder={disabled ? '会话还没准备好…' : '说点什么，Enter 发送 / Shift+Enter 换行'}
        rows={1}
        maxLength={4000}
        aria-label="对话消息"
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {draft.length > 3200 ? <span className={styles.characterCount}>{draft.length}/4000</span> : null}
      <button
        className={styles.send}
        type="submit"
        disabled={disabled || draft.trim().length === 0}
        aria-label="发送"
      >
        <Icon name="send" />
      </button>
    </form>
  );
}
