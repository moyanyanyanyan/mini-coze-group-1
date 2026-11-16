import type { ReactNode } from 'react';
import { ChatBubble } from './ChatBubble';
import { MessageComposer } from './MessageComposer';
import { AgentSwitcher } from './AgentSwitcher';
import { Icon, ActionMenu } from '../../components';
import type { LinkComponentType } from '../../layouts/types';
import type { ChatViewport } from './useChatViewport';
import type { ChatMessageView, ChatAgentOption, ChatConversationItem } from './types';
import styles from './agent-chat.module.css';

export interface AgentChatViewProps {
  conversationId: string | null;
  conversations: ChatConversationItem[];
  agents: ChatAgentOption[];
  selectedAgentId: string;
  messages: ChatMessageView[];
  citationsByMessage: Record<string, { title: string }[]>;
  streamingId: string | null;
  sendError: string;
  needsAgent: boolean;
  bootError: string;
  switching: boolean;
  suggestedPrompts: string[];
  viewport: ChatViewport;
  confirmation: ReactNode;
  LinkComponent: LinkComponentType;
  createAgentRoute: string;
  handleNewConversation: () => void;
  handleConversationChange: (id: string) => void;
  handleDeleteConversation: (id: string) => void;
  handleAgentChange: (id: string) => void;
  handleSend: (content: string) => void;
  handleStop: () => void;
  onRetry: () => void;
}

export function AgentChatView({
  conversationId, conversations, agents, selectedAgentId, messages, citationsByMessage,
  streamingId, sendError, needsAgent, bootError, switching, suggestedPrompts, viewport,
  confirmation, LinkComponent, createAgentRoute, handleNewConversation, handleConversationChange,
  handleDeleteConversation, handleAgentChange, handleSend, handleStop, onRetry,
}: AgentChatViewProps) {
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId);
  const { conversationsOpen, setConversationsOpen, conversationPanelRef, conversationDrawer,
    streamRef, onScroll, awayFromBottom, jumpToLatest } = viewport;

  return (
    <section className={`${styles.page} ${conversationsOpen ? styles.panelOpen : styles.panelClosed}`} aria-label="智能体聊天">
      {confirmation}
      {conversationsOpen && <button className={styles.panelBackdrop} aria-label="关闭会话列表" onClick={() => setConversationsOpen(false)} />}
      <aside ref={conversationPanelRef} role={conversationDrawer ? 'dialog' : undefined} aria-modal={conversationDrawer || undefined} className={styles.conversationPanel} aria-label="会话列表">
        <div className={styles.conversationHeader}>
          <div>
            <strong>历史对话</strong>
          </div>
          <button className={styles.panelClose} aria-label="关闭会话列表" onClick={() => setConversationsOpen(false)}><Icon name="close" /></button>
        </div>
          <button
            type="button"
            className={styles.newConversation}
            disabled={!selectedAgentId || streamingId !== null || switching}
            onClick={() => void handleNewConversation()}
          >
            <Icon name="plus" /> 新建对话
          </button>
        <div className={styles.conversationList}>
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`${styles.conversationItem}${conversation.id === conversationId ? ` ${styles.conversationItemActive}` : ''}`}
            >
              <button
                type="button"
                className={styles.conversationSelect}
                onClick={() => void handleConversationChange(conversation.id)}
              >
                <span>{conversation.title || '新对话'}</span>
                <small>{new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}</small>
              </button>
              <ActionMenu label={`会话操作：${conversation.title || '新对话'}`}><button
                type="button"
                className={styles.conversationDelete}
                disabled={switching || streamingId !== null}
                aria-label={`删除会话 ${conversation.title || '新对话'}`}
                onClick={() => void handleDeleteConversation(conversation.id)}
              >
                删除对话
              </button></ActionMenu>
            </div>
          ))}
        </div>
      </aside>

      <div className={styles.chatMain}>
        <header className={styles.header}>
          <button className={styles.panelToggle} aria-label="历史对话" title="历史对话" aria-expanded={conversationsOpen} onClick={() => setConversationsOpen(!conversationsOpen)}><Icon name="panel" /></button>
          <AgentSwitcher agents={agents} value={selectedAgentId} disabled={streamingId !== null || switching} onChange={(id) => void handleAgentChange(id)} />
          {(switching || streamingId) && <span className={styles.activity} role="status">{switching ? '正在加载…' : '正在回复…'}</span>}
        </header>

        <div className={styles.stream} ref={streamRef} onScroll={onScroll}>
        {needsAgent && (
          <div className={styles.empty}>
            <strong>创建智能体，开始对话</strong>
            <LinkComponent className={styles.createAgent} to={createAgentRoute}>创建智能体</LinkComponent>
          </div>
        )}
        {conversationId && messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <Icon name="chat" />
            </span>
            <strong>开始你的第一段对话</strong>
            <p>从一个问题开始，或试试下面的建议。</p>
            <div className={styles.suggestions}>
              {suggestedPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  disabled={!conversationId || streamingId !== null}
                  onClick={() => void handleSend(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id}>
            <ChatBubble message={message} agentName={selectedAgent?.name} avatarUrl={selectedAgent?.avatarUrl} />
            {citationsByMessage[message.id]?.length ? (
              <div className={styles.citations} aria-label="本次检索来源">
                来源：{citationsByMessage[message.id].map((source) => source.title).join('、')}
              </div>
            ) : null}
          </div>
        ))}

        </div>

        <div className={styles.footer}>
        {bootError ? <div className={styles.alert} role="alert">{bootError} <button onClick={() => { onRetry(); }}>重试</button></div> : null}
        {sendError ? <p className={styles.alert} role="alert">{sendError}</p> : null}

          {awayFromBottom && <button className={styles.latestButton} onClick={jumpToLatest}><Icon name="arrowDown" />回到最新消息</button>}

        {conversationId && (
          <>
            <MessageComposer
              disabled={streamingId !== null || switching}
              streaming={streamingId !== null}
              onStop={handleStop}
              onSend={(content) => void handleSend(content)}
            />
            <span className={styles.composerHint}>Enter 发送 · Shift + Enter 换行</span>
          </>
        )}
        </div>
      </div>
    </section>
  );
}
