import { describe, expect, it } from 'vitest';
import { tokenActivity } from './TokenActivity';
import type { OperationRun } from './model';

describe('Token 活动按自然日汇总', () => {
  const now = new Date(2026, 0, 3, 12).getTime();
  it('合并输入与输出，排除窗口外及未来执行，支持跨年', () => {
    const runs = [
      { startedAt: now - 1000, inputTokens: 100, outputTokens: 20 },
      { startedAt: now - 2000, inputTokens: 30, outputTokens: 5 },
      { startedAt: now + 1000, inputTokens: 999, outputTokens: 0 },
      { startedAt: new Date(2025, 0, 1).getTime(), inputTokens: 999, outputTokens: 0 },
    ] as OperationRun[];
    const days = tokenActivity(runs, now);
    expect(days).toHaveLength(84);
    expect(days[0].date.startsWith('2025')).toBe(true);
    expect(days.find(d => d.date === '2026-01-03')?.total).toBe(155);
    expect(days.reduce((n, d) => n + d.total, 0)).toBe(155);
    expect(days[83].future).toBe(true);
  });
  it('没有运行时所有日期为零', () => {
    expect(tokenActivity([], now).every(d => d.total === 0)).toBe(true);
  });
});
