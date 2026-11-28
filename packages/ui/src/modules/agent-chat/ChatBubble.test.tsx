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

it('历史中断消息可重试，主动停止的消息保留取消状态', () => {
  const interrupted = renderToStaticMarkup(<ChatBubble message={message} active={false} onRetry={() => {}} />);
  expect(interrupted).toContain('生成已中断');
  expect(interrupted).toContain('重试发送');
  expect(interrupted).not.toContain('正在生成回答');
  const cancelled = renderToStaticMarkup(<ChatBubble message={{ ...message, status: 'cancelled' }} active={false} />);
  expect(cancelled).toContain('已停止生成');
  expect(cancelled).not.toContain('正在生成回答');
});

it('不渲染头像并保留 Markdown 和安全链接', () => {
  const markup = renderToStaticMarkup(<ChatBubble
    message={{ ...message, status: 'completed', content: '**回答** [链接](https://example.com) <script>alert(1)</script>' }}
    active={false}
  />);
  expect(markup).not.toContain('<img');
  expect(markup).toContain('<strong>回答</strong>');
  expect(markup).toContain('rel="noreferrer noopener"');
  expect(markup).not.toContain('<script>');
});

it('等待连接和思考时显示对应阶段', () => {
  expect(renderToStaticMarkup(<ChatBubble message={{ ...message, status: 'pending' }} active phase="connecting" />)).toContain('正在连接...');
  expect(renderToStaticMarkup(<ChatBubble message={message} active phase="thinking" />)).toContain('正在思考...');
});
