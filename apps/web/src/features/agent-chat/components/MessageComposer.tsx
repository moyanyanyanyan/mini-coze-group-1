import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import { Icon } from '../../../shared/ui/Icon';
import styles from '../agent-chat.module.css';

interface MessageComposerProps {
  disabled: boolean;
  contextRemaining: number;
  contextMax: number;
  onSend: (content: string) => void;
}

interface SelectedImage {
  id: string;
  file: File;
  url: string;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 6;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function MessageComposer({ disabled, contextRemaining, contextMax, onSend }: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [imageError, setImageError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef(new Set<string>());

  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft]);

  const send = () => {
    const content = draft.trim();
    // 聊天接口目前只接受 content；阻止附图草稿被当作纯文字发送。
    if (!content || disabled || images.length > 0) {
      return;
    }
    onSend(content);
    setDraft('');
  };

  const addImages = (files: File[]) => {
    if (!files.length) return;

    const accepted: SelectedImage[] = [];
    let error = '';
    for (const file of files) {
      if (images.length + accepted.length >= MAX_IMAGES) {
        error = `最多选择 ${MAX_IMAGES} 张图片`;
        break;
      }
      if (!IMAGE_TYPES.has(file.type)) {
        error = '仅支持 JPG、PNG 和 WEBP 图片';
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error = `${file.name} 超过单张 5 MB 的限制`;
        continue;
      }
      try {
        const url = URL.createObjectURL(file);
        previewUrlsRef.current.add(url);
        accepted.push({ id: `${Date.now()}-${Math.random()}`, file, url });
      } catch {
        error = `${file.name} 预览失败，请重新选择`;
      }
    }
    setImages((current) => [...current, ...accepted]);
    setImageError(error);
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    addImages(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    const files = itemFiles.length ? itemFiles : Array.from(event.clipboardData.files);
    if (!files.length) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    addImages(files);
  };

  const removeImage = (id: string) => {
    const removed = images.find((image) => image.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.url);
      previewUrlsRef.current.delete(removed.url);
    }
    setImages((current) => current.filter((image) => image.id !== id));
    setImageError('');
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
      <div
        className={styles.contextMeter}
        role="meter"
        aria-label="上下文历史轮次余量"
        aria-valuemin={0}
        aria-valuemax={contextMax}
        aria-valuenow={contextRemaining}
        title={`最多参考最近 ${contextMax} 轮完整历史对话；模型 Token 预算可能进一步裁剪历史。`}
      >
        <svg className={styles.contextRing} viewBox="0 0 24 24" aria-hidden="true">
          <circle className={styles.contextTrack} cx="12" cy="12" r="9" />
          <circle
            className={styles.contextValue}
            cx="12"
            cy="12"
            r="9"
            strokeDasharray={`${(2 * Math.PI * 9 * contextRemaining) / contextMax} ${2 * Math.PI * 9}`}
          />
        </svg>
        <span>{contextRemaining} 轮可用</span>
      </div>
      {images.length > 0 ? (
        <div className={styles.imagePreviews} aria-label="已选择的图片">
          {images.map((image) => (
            <div className={styles.imagePreview} key={image.id}>
              <img src={image.url} alt={image.file.name} onError={() => {
                removeImage(image.id);
                setImageError(`${image.file.name} 无法预览，请检查图片文件`);
              }} />
              <button type="button" onClick={() => removeImage(image.id)} aria-label={`移除 ${image.file.name}`} title="移除图片" disabled={disabled}>
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {imageError ? <p className={styles.imageError} role="alert">{imageError}</p> : null}
      {images.length > 0 ? <p className={styles.imageNotice} role="status">图片已在本地预览；聊天图片接口尚未接入，移除图片后可发送文字。</p> : null}
      <div className={styles.composerControls}>
        <input ref={imageInputRef} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={handleImageChange} disabled={disabled} tabIndex={-1} aria-label="选择图片" />
        <button className={styles.imagePicker} type="button" onClick={() => imageInputRef.current?.click()} disabled={disabled || images.length >= MAX_IMAGES} aria-label="添加图片" title="添加图片">
          <Icon name="image" />
        </button>
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
          onPaste={handlePaste}
        />
        {draft.length > 3200 ? <span className={styles.characterCount}>{draft.length}/4000</span> : null}
        <button
          className={styles.send}
          type="submit"
          disabled={disabled || draft.trim().length === 0 || images.length > 0}
          aria-label="发送"
          title={images.length > 0 ? '聊天图片接口尚未接入' : '发送'}
        >
          <Icon name="send" />
        </button>
      </div>
    </form>
  );
}
