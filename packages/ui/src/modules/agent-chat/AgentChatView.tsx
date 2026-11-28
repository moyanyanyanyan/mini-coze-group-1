import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChatBubble } from './ChatBubble';
import { MessageComposer } from './MessageComposer';
import { AgentSwitcher } from './AgentSwitcher';
import { ConversationHistory } from './ConversationHistory';
import { Icon } from '../../components';
import type { LinkComponentType } from '../../layouts/types';
import type { ChatViewport } from './useChatViewport';
import type { ChatMessageView, ChatAgentOption, ChatConversationItem, ComposerAttachment } from './types';
import type { ContextUsageSnapshot } from './ContextUsageIndicator';
import styles from './agent-chat.module.css';

const PANEL_WIDTH_STORAGE_KEY = 'minicoze:conversation-panel-width:v1';

function savedPanelWidth(): number {
  try {
    const stored = sessionStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    const width = stored ? Number(stored) : NaN;
    return Number.isFinite(width) ? Math.round(Math.max(220, Math.min(560, width))) : 264;
  } catch {
    // 浏览器禁用存储时仍可正常调整宽度。
    return 264;
  }
}

export interface AgentChatViewProps {
  conversationId: string | null;
  conversations: ChatConversationItem[];
  agents: ChatAgentOption[];
  selectedAgentId: string;
  messages: ChatMessageView[];
  citationsByMessage: Record<string, { title: string }[]>;
  streamingId: string | null;
  generationPhase: 'connecting' | 'thinking' | 'generating' | null;
  contextUsage: ContextUsageSnapshot;
  sendError: string;
  readiness?: 'starting' | 'ready' | 'failed' | 'unavailable';
  onReadinessRetry?: () => void;
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
  handleRenameConversation: (id: string, title: string) => Promise<boolean>;
  handleAgentChange: (id: string) => void;
  handleSend: (content: string) => void | Promise<boolean | void>;
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
  streamingId, generationPhase, contextUsage, sendError, needsAgent, bootError, switching, suggestedPrompts, viewport,
  confirmation, LinkComponent, createAgentRoute, handleNewConversation, handleConversationChange,
  handleDeleteConversation, handleRenameConversation, handleAgentChange, handleSend, handleStop, onRetry, readiness = 'ready', onReadinessRetry,
  pendingAttachments, attaching, attachmentError, onSelectFiles, onRemoveAttachment,
}: AgentChatViewProps) {
  const pageRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [panelWidth, setPanelWidth] = useState(savedPanelWidth);
  const [maxPanelWidth, setMaxPanelWidth] = useState(560);
  const [resizing, setResizing] = useState(false);
  const resize = (width: number) => {
    const nextWidth = Math.round(Math.max(220, Math.min(maxPanelWidth, width)));
    setPanelWidth(nextWidth);
    try {
      // 只保存主动调整的宽度，避免窗口变窄时覆盖用户偏好。
      sessionStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(nextWidth));
    } catch {
      // 存储不可用时保留本次页面内的调整。
    }
  };
  useEffect(() => {
    if (!pageRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      // 给右侧对话区保留阅读空间，小屏继续使用原有抽屉。
      const maximum = Math.max(220, Math.min(560, entry.contentRect.width - 480));
      setMaxPanelWidth(maximum);
      setPanelWidth((width) => Math.min(width, maximum));
    });
    observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, []);
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId);
  const selectedConversation = conversations.find(conversation => conversation.id === conversationId);
  const fallbackAgentName = selectedConversation && !selectedAgent
    ? selectedConversation.agentId ? `已删除的智能体 (${selectedConversation.agentId.slice(0, 6)})` : '未归类对话'
    : undefined;
  const { conversationsOpen, setConversationsOpen, conversationPanelRef, conversationDrawer,
    streamRef, onScroll, awayFromBottom, jumpToLatest } = viewport;

  return (
    <section ref={pageRef} style={{ '--history-width': `${panelWidth}px` } as CSSProperties}
      className={`${styles.page} ${conversationsOpen ? styles.panelOpen : styles.panelClosed}`} aria-label="智能体聊天">
      {confirmation}
      {conversationsOpen && <button className={styles.panelBackdrop} aria-label="关闭会话列表" onClick={() => setConversationsOpen(false)} />}
      <aside ref={conversationPanelRef} role={conversationDrawer ? 'dialog' : undefined} aria-modal={conversationDrawer || undefined} className={styles.conversationPanel} aria-label="会话列表">
        <div className={styles.conversationHeader}>
          <div>
            <strong>对话工作区</strong>
          </div>
          <button className={styles.panelClose} aria-label="关闭会话列表" onClick={() => setConversationsOpen(false)}><Icon name="panel" /></button>
        </div>
          <button
            type="button"
            className={styles.newConversation}
            disabled={!agents.some((agent) => agent.id === selectedAgentId && agent.status !== 'ARCHIVED') || streamingId !== null || switching || attaching}
            onClick={() => void handleNewConversation()}
          >
            <Icon name="plus" /> 新建对话
          </button>
        <ConversationHistory conversations={conversations} agents={agents} conversationId={conversationId}
          disabled={switching || attaching || streamingId !== null} onSelect={handleConversationChange}
          onDelete={handleDeleteConversation} onRename={handleRenameConversation} />
        <div className={styles.panelResize} role="separator" tabIndex={conversationDrawer || !conversationsOpen ? -1 : 0}
          aria-label="调整会话列表宽度" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={maxPanelWidth}
          aria-valuenow={panelWidth} aria-valuetext={`${panelWidth} 像素`} data-resizing={resizing || undefined}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            drag.current = { x: event.clientX, width: panelWidth };
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
          onPointerMove={(event) => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
          onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            resize(event.key === 'Home' ? 220 : event.key === 'End' ? maxPanelWidth : panelWidth + (event.key === 'ArrowRight' ? 24 : -24));
          }} />
      </aside>

      <div className={styles.chatMain}>
        <header className={styles.header}>
          {!conversationsOpen && <button className={styles.panelToggle} aria-label="历史对话" title="历史对话" aria-expanded={conversationsOpen} onClick={() => setConversationsOpen(!conversationsOpen)}><Icon name="panel" /></button>}
          <AgentSwitcher agents={agents} value={selectedAgentId} disabled={streamingId !== null || switching || attaching}
            fallbackName={fallbackAgentName} onChange={(id) => void handleAgentChange(id)} />
          {(switching || streamingId) && <span className={styles.activity} role="status">{generationPhase === 'connecting' ? '正在连接…' : generationPhase === 'thinking' ? '正在思考…' : generationPhase === 'generating' ? '正在生成…' : '正在加载…'}</span>}
        </header>

        <div className={styles.streamFrame}>
        <div className={styles.stream} ref={streamRef} onScroll={onScroll}>
        {bootError && agents.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><Icon name="plug" /></span>
            <strong>对话积木暂时没有接上</strong>
            <p>连接服务后，角色、知识与工具会重新回到这里。</p>
            <button className={styles.createAgent} type="button" onClick={onRetry}>重新连接</button>
          </div>
        ) : null}
        {needsAgent && !bootError && !conversationId && (
          <div className={styles.empty}>
            <strong>创建智能体，开始对话</strong>
            <LinkComponent className={styles.createAgent} to={createAgentRoute}>创建智能体</LinkComponent>
          </div>
        )}
        {selectedAgent && selectedAgent.status !== 'ARCHIVED' && !switching && messages.length === 0 ? (
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
                  disabled={!selectedAgentId || switching || streamingId !== null || readiness !== 'ready'}
                  onClick={() => void handleSend(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div key={message.id}>
            <ChatBubble message={message}
              active={message.id === streamingId}
              phase={message.id === streamingId ? generationPhase ?? undefined : undefined}
              onRetry={(message.status === 'failed' || ((message.status === 'running' || message.status === 'pending') && message.id !== streamingId)) && messages[index - 1]?.role === 'user' && !messages[index - 1].attachments?.length && pendingAttachments.length === 0 && !attaching && !switching && !streamingId
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
        {readiness !== 'ready' && <div className={styles.alert} role="status">
          {readiness === 'starting' ? '对话服务正在准备，准备完成后即可发送' : readiness === 'failed' ? '对话服务准备失败，请联系维护者检查并重启服务' : '暂时无法连接对话服务，正在尝试重新连接'}
          {readiness !== 'starting' && <button type="button" onClick={onReadinessRetry}>重新检查</button>}
        </div>}
        {bootError && agents.length > 0 ? <div className={styles.alert} role="alert">{bootError} <button onClick={() => { onRetry(); }}>重试</button></div> : null}
        {sendError ? <p className={styles.alert} role="alert">{sendError}</p> : null}

          {awayFromBottom && <button className={styles.latestButton} onClick={jumpToLatest}><Icon name="arrowDown" />回到最新消息</button>}

        {selectedAgent && selectedAgent.status !== 'ARCHIVED' && (
          <>
            <MessageComposer
              disabled={streamingId !== null || switching}
              sendBlocked={readiness !== 'ready'}
              contextUsage={contextUsage}
              streaming={streamingId !== null}
              onStop={handleStop}
              onSend={handleSend}
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
