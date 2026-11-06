import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { ChatMessage } from '@minicoze/shared';
import { ChatBubble } from './ChatBubble';

const message: ChatMessage = {
  id: 'reply', conversationId: 'conversation', role: 'assistant',
  content: '', status: 'running', seq: 1, createdAt: '2026-01-01T00:00:00Z',
};

it('失败的空回复不再显示生成动画，已有内容仍保留', () => {
  expect(renderToStaticMarkup(<ChatBubble message={message} />)).toContain('正在生成回答');
  const failed = renderToStaticMarkup(<ChatBubble message={{ ...message, status: 'failed' }} />);
  expect(failed).not.toContain('正在生成回答');
  expect(failed).toContain('未收到回复，请重试');
  const partial = renderToStaticMarkup(<ChatBubble message={{ ...message, status: 'failed', content: '已经生成的内容' }} />);
  expect(partial).toContain('已经生成的内容');
  expect(partial).not.toContain('未收到回复');
});
