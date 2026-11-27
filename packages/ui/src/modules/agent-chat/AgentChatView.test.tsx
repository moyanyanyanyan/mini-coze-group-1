import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
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
    contextRemaining={10}
    contextMax={10}
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
