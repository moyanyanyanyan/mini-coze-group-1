import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AgentChatPage } from './AgentChatPage';

it('聊天页提供会话导航、智能体选择和建议问题', () => {
  const markup = renderToStaticMarkup(<AgentChatPage />);

  expect(markup).toContain('会话列表');
  expect(markup).toContain('切换智能体');
  expect(markup).not.toContain('流式输出');
  expect(markup).not.toContain('根据知识库总结重点');
  expect(markup).toContain('介绍一下你能帮我做什么');
});
