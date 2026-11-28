import { useEffect, useId, useState } from 'react';
import styles from './agent-chat.module.css';

export interface ContextUsageSnapshot {
  usedTokens: number | null;
  maxTokens: number;
  source: 'actual' | 'estimated';
}

interface ContextUsageIndicatorProps {
  usage: ContextUsageSnapshot;
}

function formatTokens(value: number | null): string {
  return value === null ? '--' : `${Math.max(0, Math.round(value)).toLocaleString('en-US')} Tokens`;
}

export function ContextUsageIndicator({ usage }: ContextUsageIndicatorProps) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  const maxTokens = Number.isFinite(usage.maxTokens) && usage.maxTokens > 0 ? Math.round(usage.maxTokens) : 1;
  const reportedUsedTokens = usage.usedTokens === null || !Number.isFinite(usage.usedTokens)
    ? null
    : Math.max(0, Math.round(usage.usedTokens));
  const progressUsedTokens = reportedUsedTokens === null ? null : Math.min(maxTokens, reportedUsedTokens);
  const percentage = progressUsedTokens === null ? 0 : Math.round((progressUsedTokens / maxTokens) * 100);
  const remainingTokens = progressUsedTokens === null ? null : Math.max(0, maxTokens - progressUsedTokens);
  const tone = percentage >= 85 ? 'danger' : percentage >= 60 ? 'warning' : 'normal';
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dash = (circumference * percentage) / 100;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div
      className={`${styles.contextUsage} ${styles[`contextUsage${tone[0].toUpperCase()}${tone.slice(1)}`]}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={styles.contextUsageTrigger}
        aria-label={`上下文用量 ${reportedUsedTokens === null ? '暂无数据' : `${percentage}%`}`}
        aria-expanded={open}
        aria-describedby={descriptionId}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <span className={styles.contextUsageRing} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle className={styles.contextUsageTrack} cx="12" cy="12" r={radius} />
            <circle
              className={styles.contextUsageValue}
              cx="12"
              cy="12"
              r={radius}
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
          <span>{reportedUsedTokens === null ? '--' : `${percentage}%`}</span>
        </span>
        <span className={styles.contextUsageLabel}>上下文用量</span>
      </button>
      <div id={descriptionId} className={styles.contextUsagePopover} role="dialog" aria-label="上下文用量详情" hidden={!open}>
        <strong>上下文用量</strong>
        <dl>
          <div><dt>当前使用</dt><dd>{formatTokens(reportedUsedTokens)}</dd></div>
          <div><dt>最大容量（参考）</dt><dd>{formatTokens(maxTokens)}</dd></div>
          <div><dt>使用比例</dt><dd>{reportedUsedTokens === null ? '--' : `${percentage}%`}</dd></div>
          <div><dt>剩余容量</dt><dd>{formatTokens(remainingTokens)}</dd></div>
        </dl>
        <small>{usage.source === 'actual' ? '来源：Runtime 实际 Token' : '来源：本地估算 Token'}；容量为模型配置参考值，实际历史可能被裁剪。</small>
      </div>
    </div>
  );
}
