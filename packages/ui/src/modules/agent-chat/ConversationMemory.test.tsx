import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ConversationMemory } from './ConversationMemory';

it('区分估算与真实 Token，展示裁剪规则、附件记忆和配置上限', () => {
  const html = renderToStaticMarkup(<ConversationMemory memory={{ conversationId: 'c', systemPrompt: '系统约束', configuredTurns: 20,
    effectiveTurns: 20, retainedTurns: 1, availableTurns: 19, tokenLimit: 1024, estimatedInputTokens: 300, reservedOutputTokens: 128,
    remainingTokens: 596, droppedTurns: 2, summary: '原神与 AI 编程的压缩摘要', asOf: '2026-11-27T00:00:00Z',
    history: [{ id: 'u', role: 'user', content: '正文与附件摘要' }, { id: 'a', role: 'assistant', content: '回答' }] }} />);
  expect(html).toContain('约剩 596 Token');
  expect(html).toContain('并非模型精确 Token 数');
  expect(html).toContain('正文与附件摘要');
  expect(html).toContain('系统约束');
  expect(html).toContain('原神与 AI 编程的压缩摘要');
  expect(html).toContain('配置上限 20 轮');
  expect(html).toContain('另外移除了最旧的 2 轮');
});

it('读取失败不显示虚构的剩余额度', () => {
  const html = renderToStaticMarkup(<ConversationMemory error="服务不可用" />);
  expect(html).toContain('服务不可用');
  expect(html).toContain('暂不可用');
  expect(html).not.toContain('约剩');
});
