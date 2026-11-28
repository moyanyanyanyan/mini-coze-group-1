import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@minicoze/shared';
import { estimateConversationTokens, getContextTokenLimit } from './context-usage';

const message = (content: string, status: ChatMessage['status'] = 'completed'): ChatMessage => ({
  id: content,
  conversationId: 'conversation-1',
  role: 'user',
  status,
  seq: 1,
  content,
  createdAt: new Date(0).toISOString(),
});

describe('context usage estimation', () => {
  it('uses the configured model window and excludes failed messages', () => {
    expect(getContextTokenLimit({ model: 'deepseek-chat' })).toBe(32_768);
    expect(getContextTokenLimit({ model: 'custom-model' })).toBe(32_768);
    expect(estimateConversationTokens([message('abcd'), message('ignored', 'failed')])).toBe(5);
  });

  it('keeps only the current turn plus the configured history window', () => {
    const history = Array.from({ length: 8 }, (_, index) => message(`turn-${index}`));
    expect(estimateConversationTokens(history, '', 2)).toBeLessThan(estimateConversationTokens(history, '', 10));
  });
});
