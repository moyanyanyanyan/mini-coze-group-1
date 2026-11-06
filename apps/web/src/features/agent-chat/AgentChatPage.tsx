import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ConversationSummary } from '@minicoze/shared';
import { ApiError } from '../../shared/api/http';
import { getAgent, listAgents, type Agent } from '../agent-builder/agent.api';
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  streamMessage,
  type ChatCitation,
} from './api/chat-api';
import { ChatBubble } from './components/ChatBubble';
import { MessageComposer } from './components/MessageComposer';
import { Icon } from '../../shared/ui/Icon';
import { ActionMenu } from '../../shared/ui/ActionMenu';
import { useConfirm } from '../../shared/ui/useConfirm';
import { useOverlayFocus } from '../../shared/ui/useOverlayFocus';
import { AgentSwitcher } from './components/AgentSwitcher';
import styles from './agent-chat.module.css';

const SUGGESTED_PROMPTS = [
  '介绍一下你能帮我做什么',
  '帮我梳理一个问题的思路',
  '帮我规划下一步任务',
];

export function AgentChatPage() {
  const { confirm, confirmation } = useConfirm();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citationsByMessage, setCitationsByMessage] = useState<Record<string, ChatCitation[]>>({});
  /** 非空 = 这一轮还在生成。同时也用作「禁止再发」的闸门 */
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState('');
  const [bootError, setBootError] = useState('');
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId);
  const suggestedPrompts = selectedAgent?.knowledgeBaseBindings.some(binding => binding.enabled)
    ? [SUGGESTED_PROMPTS[0], '根据知识库总结重点', SUGGESTED_PROMPTS[2]] : SUGGESTED_PROMPTS;

  const streamRef = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const requestId = useRef(0);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1200);
  const conversationPanelRef = useRef<HTMLElement>(null);
  const conversationDrawer = conversationsOpen && typeof window !== 'undefined' && window.innerWidth < 1200;
  useOverlayFocus(conversationPanelRef, conversationDrawer, () => setConversationsOpen(false));
  const jumpToLatest = () => {
    following.current = true;
    setAwayFromBottom(false);
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  };
  // React 严格模式下 effect 会跑两次，没有这个闸门就会建出两个会话
  const booted = useRef(false);
  // C4 接缝：同一个 AbortController 贯穿整轮。
  //   前端 abort → fetch 断连 → 后端 res.on('close') → Runtime 那条 HTTP 也断
  const abortRef = useRef<AbortController | null>(null);

  const boot = useCallback(async () => {
    const request = ++requestId.current;
    setSwitching(true);
    try {
      const [agentPage, existing] = await Promise.all([listAgents(), listConversations()]);
      const available = agentPage.items.filter((agent) => agent.status !== 'ARCHIVED');
      const target = new URLSearchParams(window.location.search).get('agentId');
      if (target && !available.some(agent => agent.id === target)) available.push(await getAgent(target));
      setAgents(available);
      if (available.length === 0) {
        setBootError('请先在智能体页面创建一个智能体');
        return;
      }
      const conversation = existing.find((item) => target ? item.agentId === target : available.some((agent) => agent.id === item.agentId))
        ?? (await createConversation(target ?? available[0].id));
      const history = await listMessages(conversation.id);
      if (request !== requestId.current) return;
      following.current = true;

      setConversations(existing.some((item) => item.id === conversation.id)
        ? existing
        : [conversation, ...existing]);
      setSelectedAgentId(conversation.agentId ?? available[0].id);
      setConversationId(conversation.id);
      setMessages(history);
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof ApiError ? caught.message : '会话加载失败，请稍后再试');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  }, []);

  const handleAgentChange = async (agentId: string) => {
    const request = ++requestId.current;
    setSwitching(true);
    setBootError('');
    try {
      const existing = await listConversations();
      const conversation = existing.find((item) => item.agentId === agentId)
        ?? (await createConversation(agentId));
      const history = await listMessages(conversation.id);
      if (request !== requestId.current) return;
      following.current = true;
      setAwayFromBottom(false);
      setSelectedAgentId(agentId);
      setConversationId(conversation.id);
      setConversations(existing.some((item) => item.id === conversation.id)
        ? existing
        : [conversation, ...existing]);
      setMessages(history);
      setCitationsByMessage({});
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof Error ? caught.message : '切换智能体失败');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  };

  const handleConversationChange = async (conversation: ConversationSummary) => {
    if (streamingId || (conversation.id === conversationId && !switching)) {
      return;
    }
    setBootError('');
    setSendError('');
    const request = ++requestId.current;
    setSwitching(true);
    try {
      const history = await listMessages(conversation.id);
      if (request !== requestId.current) return;
      following.current = true;
      setAwayFromBottom(false);
      if (window.innerWidth < 1200) setConversationsOpen(false);
      setConversationId(conversation.id);
      setSelectedAgentId(conversation.agentId ?? '');
      setMessages(history);
      setCitationsByMessage({});
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof Error ? caught.message : '会话加载失败');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  };

  const handleNewConversation = async () => {
    if (!selectedAgentId || streamingId || switching) {
      return;
    }
    setBootError('');
    const request = ++requestId.current;
    setSwitching(true);
    try {
      const conversation = await createConversation(selectedAgentId);
      if (request !== requestId.current) return;
      setConversations((items) => [conversation, ...items]);
      setConversationId(conversation.id);
      setMessages([]);
      jumpToLatest();
      if (window.innerWidth < 1200) setConversationsOpen(false);
      setCitationsByMessage({});
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof Error ? caught.message : '新建会话失败');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  };

  const handleDeleteConversation = async (conversation: ConversationSummary) => {
    if (streamingId || switching) {
      return;
    }
    if (!await confirm(`确定删除“${conversation.title || '新对话'}”吗？删除后无法恢复。`)) {
      return;
    }
    try {
      await deleteConversation(conversation.id);
      const next = conversations.filter((item) => item.id !== conversation.id);
      setConversations(next);
      if (conversation.id === conversationId) {
        const fallback = next[0];
        if (fallback) {
          await handleConversationChange(fallback);
        } else {
          await handleNewConversation();
        }
      }
    } catch (caught) {
      setBootError(caught instanceof Error ? caught.message : '删除会话失败');
    }
  };

  useEffect(() => {
    if (booted.current) {
      return;
    }
    booted.current = true;
    void boot();
  }, [boot]);

  // 只滚动消息容器；阅读历史时不抢走用户的滚动位置。
  useEffect(() => {
    if (following.current) jumpToLatest();
  }, [messages, streamingId]);

  const handleSend = async (content: string) => {
    if (!conversationId || streamingId || switching) {
      return;
    }

    setSendError('');
    following.current = true;
    setAwayFromBottom(false);

    const now = new Date().toISOString();
    // 乐观插入：不等后端回包就把两条气泡画出来，打字效果才不卡
    const assistantKey = `tmp-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-user-${Date.now()}`,
        conversationId,
        role: 'user',
        status: 'completed',
        seq: -2,
        content,
        createdAt: now,
      },
      { id: assistantKey, conversationId, role: 'assistant', status: 'running', seq: -1, content: '', createdAt: now },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingId(assistantKey);

    // run.started 一到就有真 id，之后所有更新按它定位。
    // 用 let 而不是 ref，是因为它只活在这一轮里
    let targetId = assistantKey;

    try {
      await streamMessage(
        conversationId,
        content,
        {
          onStarted: (assistantMessageId) => {
            targetId = assistantMessageId;
            setStreamingId(assistantMessageId);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantKey ? { ...m, id: assistantMessageId } : m)),
            );
          },
          onDelta: (chunk) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === targetId ? { ...m, content: m.content + chunk } : m)),
            );
          },
          onKnowledge: (_status, citations) => {
            setCitationsByMessage((prev) => ({ ...prev, [targetId]: citations }));
          },
          onCompleted: (finalContent) => {
            // 以后端给的全量为准，避免网络抖动丢过某个 delta
            setMessages((prev) =>
              prev.map((m) =>
                m.id === targetId
                  ? { ...m, content: finalContent || m.content, status: 'completed' }
                  : m,
              ),
            );
            void listConversations().then(setConversations).catch(() => undefined);
          },
          onFailed: (_code, message) => {
            setSendError(message);
            setMessages((prev) =>
              prev.map((m) => (m.id === targetId ? { ...m, status: 'failed' } : m)),
            );
          },
        },
        controller.signal,
      );
    } catch (caught) {
      // 主动停止是正常路径，不弹错误；半截内容原样留在气泡里
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setSendError(caught instanceof ApiError ? caught.message : '发送失败，请稍后再试');
      }
    } finally {
      // 无论怎么结束，气泡都不该永远停在「生成中」
      setMessages((prev) =>
        prev.map((m) =>
          m.role === 'assistant' && m.status === 'running'
            ? { ...m, status: m.content ? 'completed' : 'failed' }
            : m,
        ),
      );
      abortRef.current = null;
      setStreamingId(null);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

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
                onClick={() => void handleConversationChange(conversation)}
              >
                <span>{conversation.title || '新对话'}</span>
                <small>{new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}</small>
              </button>
              <ActionMenu label={`会话操作：${conversation.title || '新对话'}`}><button
                type="button"
                className={styles.conversationDelete}
                disabled={switching || streamingId !== null}
                aria-label={`删除会话 ${conversation.title || '新对话'}`}
                onClick={() => void handleDeleteConversation(conversation)}
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

        <div className={styles.stream} ref={streamRef} onScroll={() => {
          const el = streamRef.current;
          if (!el) return;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
          setAwayFromBottom(!following.current);
        }}>
        {messages.length === 0 ? (
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
        {bootError ? <div className={styles.alert} role="alert">{bootError} <button onClick={() => { setBootError(''); void boot(); }}>重试</button> <a href="/workspace/agents/create">创建智能体</a></div> : null}
        {sendError ? <p className={styles.alert} role="alert">{sendError}</p> : null}

          {awayFromBottom && <button className={styles.latestButton} onClick={jumpToLatest}><Icon name="arrowDown" />回到最新消息</button>}

        <MessageComposer
          disabled={!conversationId || streamingId !== null || switching}
          streaming={streamingId !== null}
          unavailable={!conversationId && !switching}
          onStop={handleStop}
          onSend={(content) => void handleSend(content)}
        />
        <span className={styles.composerHint}>Enter 发送 · Shift + Enter 换行</span>
        </div>
      </div>
    </section>
  );
}
