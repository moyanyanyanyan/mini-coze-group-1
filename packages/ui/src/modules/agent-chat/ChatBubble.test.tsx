import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { ChatMessageView } from './types';
import { ChatBubble } from './ChatBubble';

const message: ChatMessageView = {
  id: 'reply', role: 'assistant',
  content: '', status: 'running',
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
