import { useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Icon } from '../../components';
import styles from './agent-chat.module.css';

interface MessageComposerProps {
  disabled: boolean;
  onSend: (content: string) => void;
  streaming?: boolean;
  unavailable?: boolean;
  onStop?: () => void;
}

export function MessageComposer({ disabled, onSend, streaming, unavailable, onStop }: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
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
        ref={inputRef}
        aria-label="消息内容"
        className={styles.textarea}
        value={draft}
        placeholder={streaming ? '正在回复，可点击右侧停止' : disabled ? unavailable ? '请先选择可用的智能体' : '正在加载会话…' : '发送消息…'}
        rows={1}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {streaming ? <button className={styles.send} type="button" aria-label="停止生成" onClick={onStop}><Icon name="stop" /></button> : <button
        className={styles.send}
        type="submit"
        disabled={disabled || draft.trim().length === 0}
        aria-label="发送"
      >
        <Icon name="send" />
      </button>}
    </form>
  );
}
