import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AgentChatPage } from './AgentChatPage';

it('聊天初始化前显示导航和智能体选择，等待可用会话后再显示提示和输入框', () => {
  const markup = renderToStaticMarkup(<AgentChatPage />);

  expect(markup).toContain('会话列表');
  expect(markup).toContain('切换智能体');
  expect(markup).not.toContain('流式输出');
  expect(markup).not.toContain('根据知识库总结重点');
  expect(markup).not.toContain('介绍一下你能帮我做什么');
  expect(markup).not.toContain('<textarea');
  expect(markup).not.toContain('创建智能体，开始对话');
});
