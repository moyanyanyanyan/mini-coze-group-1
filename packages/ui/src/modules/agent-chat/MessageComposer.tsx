import { useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from 'react';
import { Icon } from '../../components';
import type { ComposerAttachment } from './types';
import styles from './agent-chat.module.css';

const ACCEPT = '.pdf,.docx,.md,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.pptx,.html';

interface MessageComposerProps {
  disabled: boolean;
  onSend: (content: string) => void | Promise<boolean | void>;
  sendBlocked?: boolean;
  streaming?: boolean;
  unavailable?: boolean;
  onStop?: () => void;
  /** 已上传（含解析中/失败）的附件，展示在输入框上方 */
  attachments?: ComposerAttachment[];
  uploading?: boolean;
  attachmentError?: string;
  onSelectFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
}

export function MessageComposer({
  disabled, onSend, streaming, unavailable, onStop, sendBlocked,
  attachments = [], uploading = false, attachmentError, onSelectFiles, onRemoveAttachment,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
  }, [draft]);

  const sendingRef = useRef(false);
  const hasBlockingAttachment = attachments.some((attachment) => attachment.status !== 'READY');
  const canSend = !disabled && !sendBlocked && !uploading && !hasBlockingAttachment && draft.trim().length > 0;

  const send = async () => {
    const content = draft.trim();
    if (!canSend || sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    try {
      if (await onSend(content) !== false) setDraft(current => current.trim() === content ? '' : current);
    } finally {
      sendingRef.current = false;
    }
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

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 清空 value，下一次选同一个文件才会再次触发 change
    event.target.value = '';
    if (files.length > 0) {
      onSelectFiles?.(files);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      onSelectFiles?.(files);
    }
  };

  // 粘贴截图：剪贴板里有文件就走附件，不让图片变成正文
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      onSelectFiles?.(files);
    }
  };

  return (
    <form
      className={`${styles.composer}${dragActive ? ` ${styles.composerDragging}` : ''}`}
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className={styles.composerAttachments}>
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className={`${styles.attachmentChip}${attachment.status === 'FAILED' ? ` ${styles.attachmentChipFailed}` : ''}`}
            >
              <span className={styles.attachmentName} title={attachment.fileName}>{attachment.fileName}</span>
              <span className={styles.attachmentMeta}>
                {attachment.status === 'PARSING' ? '解析中' : attachment.status === 'FAILED' ? '解析失败' : formatFileSize(attachment.byteSize)}
              </span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  className={styles.attachmentRemove}
                  aria-label={`移除附件 ${attachment.fileName}`}
                  onClick={() => onRemoveAttachment(attachment.id)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {attachmentError ? <p className={styles.attachmentError} role="alert">{attachmentError}</p> : null}
      <input
        ref={fileRef}
        className={styles.fileInput}
        type="file"
        multiple
        accept={ACCEPT}
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFiles}
      />
      <button
        type="button"
        className={styles.attachButton}
        aria-label="添加附件"
        title="添加附件"
        disabled={disabled || streaming || uploading}
        onClick={() => fileRef.current?.click()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.4 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.2-9.19a4 4 0 015.65 5.66l-9.2 9.19a2 2 0 01-2.82-2.83l8.49-8.48" />
        </svg>
      </button>
      <textarea
        ref={inputRef}
        aria-label="消息内容"
        className={styles.textarea}
        value={draft}
        placeholder={streaming ? '正在拼接回答，可点击右侧停止' : disabled ? unavailable ? '请先选择一位可用的智能体' : '正在整理对话积木…' : '放入你的下一块想法…'}
        rows={1}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
      {streaming ? <button className={styles.send} type="button" aria-label="停止生成" onClick={onStop}><Icon name="stop" /></button> : <button
        className={styles.send}
        type="submit"
        disabled={!canSend}
        aria-label="发送"
      >
        <Icon name="send" />
      </button>}
    </form>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
