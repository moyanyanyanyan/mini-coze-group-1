import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { LinkProps } from '../../layouts/types';
import type { ChatAgentOption, ChatMessageView } from './types';
import type { ChatViewport } from './useChatViewport';
import { AgentChatView } from './AgentChatView';

const agent: ChatAgentOption = { id: 'agent-1', name: '测试智能体', status: 'ACTIVE' };
const failedTurn: ChatMessageView[] = [
  { id: 'user-1', role: 'user', status: 'completed', content: '请继续' },
  { id: 'assistant-1', role: 'assistant', status: 'failed', content: '' },
];
const viewport = {
  conversationsOpen: false,
  setConversationsOpen: () => {},
  conversationPanelRef: { current: null },
  conversationDrawer: false,
  streamRef: { current: null },
  following: { current: true },
  onScroll: () => {},
  awayFromBottom: false,
  setAwayFromBottom: () => {},
  jumpToLatest: () => {},
  closeConversationDrawer: () => {},
} as unknown as ChatViewport;

const render = (pendingAttachments: ChatMessageView['attachments'] = [], overrides: Partial<Parameters<typeof AgentChatView>[0]> = {}) => renderToStaticMarkup(
  <AgentChatView
    conversationId="conversation-1"
    conversations={[]}
    agents={[agent]}
    selectedAgentId={agent.id}
    messages={failedTurn}
    citationsByMessage={{}}
    streamingId={null}
    generationPhase={null}
    contextUsage={{ usedTokens: 0, maxTokens: 1000, source: 'estimated' }}
    sendError=""
    needsAgent={false}
    bootError=""
    switching={false}
    suggestedPrompts={[]}
    viewport={viewport}
    confirmation={null}
    LinkComponent={({ to, ...props }: LinkProps) => <a href={to} {...props} />}
    createAgentRoute="/agents/new"
    handleNewConversation={() => {}}
    handleConversationChange={() => {}}
    handleDeleteConversation={() => {}}
    handleRenameConversation={async () => true}
    handleAgentChange={() => {}}
    handleSend={() => {}}
    handleStop={() => {}}
    onRetry={() => {}}
    pendingAttachments={pendingAttachments ?? []}
    attaching={false}
    attachmentError=""
    onSelectFiles={() => {}}
    onRemoveAttachment={() => {}}
    {...overrides}
  />,
);

it('附件待发送时隐藏历史消息重试，避免把新附件误绑定到旧问题', () => {
  const attachment = { id: 'a1', fileName: '说明.md', sourceType: 'FILE', byteSize: 12, status: 'READY' as const };
  expect(render()).toContain('重试发送');
  expect(render([attachment])).not.toContain('重试发送');
});

it('附件上传期间隐藏历史消息重试', () => {
  expect(render([], { attaching: true })).not.toContain('重试发送');
});

it('输入区仅显示用量环，不显示剩余轮数、记忆展开条或来源说明', () => {
  const markup = render();
  expect(markup).toContain('上下文用量');
  expect(markup).not.toContain('轮可用');
  expect(markup).not.toContain('上下文与记忆');
  expect(markup).not.toContain('来源：');
});

it('智能体配置了头像时，聊天标题和回复仍不显示头像', () => {
  const markup = render([], { agents: [{ ...agent, avatarUrl: '/agent-avatar.png' }] });
  expect(markup).toContain('测试智能体');
  expect(markup).not.toContain('/agent-avatar.png');
});

afterEach(() => vi.unstubAllGlobals());

it('切换页面重新挂载时恢复会话列表的宽度', () => {
  const values = new Map([['minicoze:conversation-panel-width:v1', '408']]);
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null });
  expect(render()).toContain('--history-width:408px');
  expect(render()).toContain('aria-valuenow="408"');
  values.set('minicoze:conversation-panel-width:v1', '456');
  expect(render()).toContain('--history-width:456px');
});

it.each([['invalid', 264], ['', 264], ['Infinity', 264], ['100', 220], ['900', 560]])('已保存宽度 %s 使用有效值 %s', (stored, expected) => {
  vi.stubGlobal('sessionStorage', { getItem: () => stored });
  expect(render()).toContain(`--history-width:${expected}px`);
});

it('浏览器拒绝读取存储时仍显示默认宽度', () => {
  vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('storage unavailable'); } });
  expect(render()).toContain('--history-width:264px');
});
