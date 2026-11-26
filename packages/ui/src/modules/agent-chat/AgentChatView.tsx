import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChatBubble } from './ChatBubble';
import { MessageComposer } from './MessageComposer';
import { AgentSwitcher } from './AgentSwitcher';
import { Icon, ActionMenu } from '../../components';
import type { LinkComponentType } from '../../layouts/types';
import type { ChatViewport } from './useChatViewport';
import type { ChatMessageView, ChatAgentOption, ChatConversationItem, ComposerAttachment } from './types';
import styles from './agent-chat.module.css';

export interface AgentChatViewProps {
  conversationId: string | null;
  conversations: ChatConversationItem[];
  agents: ChatAgentOption[];
  selectedAgentId: string;
  messages: ChatMessageView[];
  citationsByMessage: Record<string, { title: string }[]>;
  streamingId: string | null;
  generationPhase: 'connecting' | 'thinking' | 'generating' | null;
  contextRemaining: number;
  contextMax: number;
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
  pendingAttachments: ComposerAttachment[];
  attaching: boolean;
  attachmentError: string;
  onSelectFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

export function AgentChatView({
  conversationId, conversations, agents, selectedAgentId, messages, citationsByMessage,
  streamingId, generationPhase, contextRemaining, contextMax, sendError, needsAgent, bootError, switching, suggestedPrompts, viewport,
  confirmation, LinkComponent, createAgentRoute, handleNewConversation, handleConversationChange,
  handleDeleteConversation, handleAgentChange, handleSend, handleStop, onRetry,
  pendingAttachments, attaching, attachmentError, onSelectFiles, onRemoveAttachment,
}: AgentChatViewProps) {
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId);
  const { conversationsOpen, setConversationsOpen, conversationPanelRef, conversationDrawer,
    streamRef, onScroll, awayFromBottom, jumpToLatest } = viewport;
  const [query, setQuery] = useState('');
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const promptRefs = useRef(new Map<string, HTMLDivElement>());
  const promptMarkRefs = useRef(new Map<string, HTMLButtonElement>());
  const userPrompts = messages.filter((message) => message.role === 'user');
  const updateTurnRail = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const streamTop = stream.getBoundingClientRect().top;
    let active: string | null = null;
    for (const message of userPrompts) {
      const element = promptRefs.current.get(message.id);
      if (!element) continue;
      const top = element.getBoundingClientRect().top - streamTop;
      const mark = promptMarkRefs.current.get(message.id);
      if (mark) mark.style.top = `${top + 13}px`;
      if (top <= 140) active = message.id;
    }
    setActivePromptId(active);
  };
  useEffect(() => {
    updateTurnRail();
    const stream = streamRef.current;
    if (!stream || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateTurnRail);
    observer.observe(stream);
    return () => observer.disconnect();
  }, [messages]);

  return (
    <section className={`${styles.page} ${conversationsOpen ? styles.panelOpen : styles.panelClosed}`} aria-label="智能体聊天">
      {confirmation}
      {conversationsOpen && <button className={styles.panelBackdrop} aria-label="关闭会话列表" onClick={() => setConversationsOpen(false)} />}
      <aside ref={conversationPanelRef} role={conversationDrawer ? 'dialog' : undefined} aria-modal={conversationDrawer || undefined} className={styles.conversationPanel} aria-label="会话列表">
        <div className={styles.conversationHeader}>
          <div>
            <strong>对话工作区</strong>
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
          <input className={styles.historySearch} type="search" aria-label="搜索历史对话" placeholder="搜索历史对话" value={query} onChange={(event) => setQuery(event.target.value)} />
          {conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((conversation) => (
            <div
              key={conversation.id}
              className={`${styles.conversationItem}${conversation.id === conversationId ? ` ${styles.conversationItemActive}` : ''}`}
            >
              <button
                type="button"
                className={styles.conversationSelect}
                disabled={switching || streamingId !== null}
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
          {(switching || streamingId) && <span className={styles.activity} role="status">{generationPhase === 'connecting' ? '正在连接…' : generationPhase === 'thinking' ? '正在思考…' : generationPhase === 'generating' ? '正在生成…' : '正在加载…'}</span>}
        </header>

        <div className={styles.streamFrame}>
          <nav className={styles.turnRail} aria-label="本轮对话提问">
            {userPrompts.map((message, index) => (
              <button key={message.id} type="button"
                ref={(element) => {
                  if (element) promptMarkRefs.current.set(message.id, element);
                  else promptMarkRefs.current.delete(message.id);
                }}
                className={`${styles.turnMark}${activePromptId === message.id ? ` ${styles.turnMarkActive}` : ''}`}
                title={`第 ${index + 1} 轮：${message.content}`}
                aria-label={`跳转到第 ${index + 1} 轮提问：${message.content}`}
                aria-current={activePromptId === message.id ? 'location' : undefined}
                onClick={() => promptRefs.current.get(message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              />
            ))}
          </nav>
        <div className={styles.stream} ref={streamRef} onScroll={() => { onScroll(); updateTurnRail(); }}>
        {bootError && agents.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><Icon name="plug" /></span>
            <strong>对话积木暂时没有接上</strong>
            <p>连接服务后，角色、知识与工具会重新回到这里。</p>
            <button className={styles.createAgent} type="button" onClick={onRetry}>重新连接</button>
          </div>
        ) : null}
        {needsAgent && !bootError && (
          <div className={styles.empty}>
            <strong>创建智能体，开始对话</strong>
            <LinkComponent className={styles.createAgent} to={createAgentRoute}>创建智能体</LinkComponent>
          </div>
        )}
        {selectedAgentId && !switching && messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <Icon name="chat" />
            </span>
            <strong>放下第一块想法</strong>
            <p>从一个问题开始，妙搭会把知识、工具和流程拼到回答里。</p>
            <div className={styles.suggestions}>
              {suggestedPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  disabled={!selectedAgentId || switching || streamingId !== null}
                  onClick={() => void handleSend(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div key={message.id}
            ref={message.role === 'user' ? (element) => {
              if (element) promptRefs.current.set(message.id, element);
              else promptRefs.current.delete(message.id);
            } : undefined}
            className={message.role === 'user' ? styles.userTurnAnchor : undefined}
          >
            <ChatBubble message={message} agentName={selectedAgent?.name} avatarUrl={selectedAgent?.avatarUrl}
              active={message.id === streamingId}
              phase={message.id === streamingId ? generationPhase ?? undefined : undefined}
              onRetry={(message.status === 'failed' || ((message.status === 'running' || message.status === 'pending') && message.id !== streamingId)) && messages[index - 1]?.role === 'user' && !switching && !streamingId
                ? () => handleSend(messages[index - 1].content) : undefined}
            />
            {citationsByMessage[message.id]?.length ? (
              <div className={styles.citations} aria-label="本次检索来源">
                来源：{citationsByMessage[message.id].map((source) => source.title).join('、')}
              </div>
            ) : null}
          </div>
        ))}

        </div>
        </div>

        <div className={styles.footer}>
        {bootError && agents.length > 0 ? <div className={styles.alert} role="alert">{bootError} <button onClick={() => { onRetry(); }}>重试</button></div> : null}
        {sendError ? <p className={styles.alert} role="alert">{sendError}</p> : null}

          {awayFromBottom && <button className={styles.latestButton} onClick={jumpToLatest}><Icon name="arrowDown" />回到最新消息</button>}

        {selectedAgentId && (
          <>
            <MessageComposer
              disabled={streamingId !== null || switching}
              contextRemaining={contextRemaining}
              contextMax={contextMax}
              streaming={streamingId !== null}
              onStop={handleStop}
              onSend={(content) => void handleSend(content)}
              attachments={pendingAttachments}
              uploading={attaching}
              attachmentError={attachmentError}
              onSelectFiles={onSelectFiles}
              onRemoveAttachment={onRemoveAttachment}
            />
            <span className={styles.composerHint}>输入想法，妙搭负责把能力拼起来 · Enter 发送</span>
          </>
        )}
        </div>
      </div>
    </section>
  );
}
