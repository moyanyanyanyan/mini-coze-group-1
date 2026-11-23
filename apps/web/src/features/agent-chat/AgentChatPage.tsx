import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ConversationSummary } from '@minicoze/shared';
import { ApiError } from '../../shared/api/http';
import { listAgents, type Agent } from '../agent-builder/agent.api';
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  streamMessage,
  type ChatCitation,
} from './api/chat-api';
import { ChatBubble } from './components/ChatBubble';
import { ConversationList } from './components/ConversationList';
import { MessageComposer } from './components/MessageComposer';
import { Icon } from '../../shared/ui/Icon';
import { navigate } from '../../shared/routing/navigation';
import styles from './agent-chat.module.css';

const CONTEXT_HISTORY_ROUND_LIMIT = 10;

export function AgentChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citationsByMessage, setCitationsByMessage] = useState<Record<string, ChatCitation[]>>({});
  /** 非空 = 这一轮还在生成，同时用作「禁止再发 / 禁止切换」的闸门 */
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [generationPhase, setGenerationPhase] = useState<'connecting' | 'thinking' | 'generating' | null>(null);
  const [sendError, setSendError] = useState('');
  const [bootError, setBootError] = useState('');
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [preparingMessage, setPreparingMessage] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showScrollJump, setShowScrollJump] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const promptRefs = useRef(new Map<string, HTMLDivElement>());
  const promptMarkRefs = useRef(new Map<string, HTMLButtonElement>());
  // React 严格模式下 effect 会跑两次，没有这个闸门就会重复拉数据
  const booted = useRef(false);
  // 同一个 AbortController 贯穿整轮：前端 abort → 后端 res.on('close') → Runtime 那条 HTTP 也断
  const abortRef = useRef<AbortController | null>(null);
  // 增量先攒在 ref 里，每帧只 setState 一次。一个字一次 setState 会把主线程打满
  const deltaBuffer = useRef('');
  const frameRef = useRef<number | null>(null);
  // 当前这轮 assistant 消息 id，onStarted 后换成后端真 id
  const targetIdRef = useRef<string | null>(null);
  // 只有用户本来就在底部时才自动跟随；往上翻历史时不能被每帧拽回去
  const atBottomRef = useRef(true);
  const conversationRequestRef = useRef(0);
  const sendingRef = useRef(false);

  const boot = useCallback(async () => {
    try {
      const [agentPage, existing] = await Promise.all([listAgents(), listConversations()]);
      const available = agentPage.items.filter((agent) => agent.status !== 'ARCHIVED');
      setAgents(available);
      if (available.length === 0) {
        setBootError('请先在智能体页面创建一个智能体');
        return;
      }

      // 没有 agentId 的历史会话打不开（后端会 400），不进列表
      const usable = existing.filter(
        (item) => item.agentId && available.some((agent) => agent.id === item.agentId),
      );
      setConversations(usable);

      const requestedConversationId = new URLSearchParams(window.location.search).get('conversation');
      const latest = usable.find((item) => item.id === requestedConversationId) ?? usable[0];
      if (latest) {
        setSelectedAgentId(latest.agentId ?? available[0].id);
        setLoadingConversation(true);
        const history = await listMessages(latest.id);
        setConversationId(latest.id);
        setMessages(history);
        setLoadingConversation(false);
      } else {
        setSelectedAgentId(available[0].id);
      }
    } catch (caught) {
      setBootError(caught instanceof ApiError ? caught.message : '会话加载失败，请稍后再试');
      setLoadingConversation(false);
    }
  }, []);

  useEffect(() => {
    if (booted.current) {
      return;
    }
    booted.current = true;
    void boot();
  }, [boot]);

  // 离开页面（切路由 / 关标签）时掐掉进行中的流，否则后端会一直挂到超时
  useEffect(() => () => abortRef.current?.abort(), []);

  // 有新内容就滚到底，但只在用户本来就在底部时
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, streamingId]);

  const handleStreamScroll = () => {
    const el = streamRef.current;
    if (!el) {
      return;
    }
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollJump(!atBottomRef.current);

    const streamTop = el.getBoundingClientRect().top;
    const cutoff = streamTop + 140;
    let currentPrompt: string | null = null;
    for (const message of messages) {
      if (message.role !== 'user') continue;
      const element = promptRefs.current.get(message.id);
      if (element) {
        const top = element.getBoundingClientRect().top - streamTop + 13;
        const mark = promptMarkRefs.current.get(message.id);
        if (mark) mark.style.top = `${top}px`;
        if (element.getBoundingClientRect().top <= cutoff) currentPrompt = message.id;
      }
    }
    setActivePromptId(currentPrompt);
  };

  useEffect(() => {
    handleStreamScroll();
  }, [messages]);

  const refreshConversations = async (agentList: Agent[]) => {
    try {
      const list = await listConversations();
      setConversations(
        list.filter((item) => item.agentId && agentList.some((agent) => agent.id === item.agentId)),
      );
    } catch {
      // 列表刷新失败不影响当前这轮对话
    }
  };

  const handleSelectConversation = async (id: string) => {
    if (id === conversationId || streamingId) {
      return;
    }
    setBootError('');
    setSendError('');
    setLoadingConversation(true);
    const requestId = ++conversationRequestRef.current;
    try {
      const history = await listMessages(id);
      if (requestId !== conversationRequestRef.current) return;
      const target = conversations.find((item) => item.id === id);
      if (target?.agentId) {
        setSelectedAgentId(target.agentId);
      }
      setConversationId(id);
      setMessages(history);
      setCitationsByMessage({});
      atBottomRef.current = true;
    } catch (caught) {
      if (requestId === conversationRequestRef.current) {
        setBootError(caught instanceof ApiError ? caught.message : '对话加载失败，请稍后再试');
      }
    } finally {
      if (requestId === conversationRequestRef.current) setLoadingConversation(false);
    }
  };

  const handleNewConversation = () => {
    if (streamingId) {
      return;
    }
    // 不在库里建空会话：真正创建推迟到发第一条消息时
    setConversationId(null);
    setMessages([]);
    setCitationsByMessage({});
    setSendError('');
    setBootError('');
    atBottomRef.current = true;
    setShowScrollJump(false);
  };

  const handleDeleteConversation = async (target: ConversationSummary) => {
    if (streamingId) {
      return;
    }
    const name = target.title || '新对话';
    if (!window.confirm(`删除对话「${name}」？删除后无法恢复。`)) {
      return;
    }
    try {
      await deleteConversation(target.id);
      const rest = conversations.filter((item) => item.id !== target.id);
      setConversations(rest);
      if (conversationId === target.id) {
        setCitationsByMessage({});
        const next = rest[0];
        if (next) {
          setConversationId(next.id);
          setMessages(await listMessages(next.id));
          if (next.agentId) {
            setSelectedAgentId(next.agentId);
          }
        } else {
          setConversationId(null);
          setMessages([]);
        }
      }
    } catch (caught) {
      setSendError(caught instanceof ApiError ? caught.message : '删除失败，请稍后再试');
    }
  };

  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
    // 换智能体等于开一段新对话；同样推迟到发消息时再落库
    setConversationId(null);
    setMessages([]);
    setCitationsByMessage({});
    setSendError('');
    setBootError('');
    atBottomRef.current = true;
    setShowScrollJump(false);
  };

  const handleSend = async (content: string) => {
    if (streamingId || sendingRef.current || loadingConversation || !selectedAgentId) {
      return;
    }
    sendingRef.current = true;
    setPreparingMessage(true);
    setSendError('');

    let convId = conversationId;
    const now = new Date().toISOString();
    const key = `${Date.now()}-${Math.random()}`;
    const assistantKey = `tmp-assistant-${key}`;
    const userKey = `tmp-user-${key}`;
    // 先显示本轮消息；新会话的创建请求也可能需要一段时间。
    setMessages((prev) => [
      ...prev,
      {
        id: userKey,
        conversationId: convId ?? '',
        role: 'user',
        status: 'completed',
        seq: -2,
        content,
        createdAt: now,
      },
      {
        id: assistantKey,
        conversationId: convId ?? '',
        role: 'assistant',
        status: 'pending',
        seq: -1,
        content: '',
        createdAt: now,
      },
    ]);
    atBottomRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingId(assistantKey);
    setGenerationPhase('connecting');
    targetIdRef.current = assistantKey;
    deltaBuffer.current = '';
    let terminalStatus: ChatMessage['status'] | null = null;
    let phase: 'connecting' | 'thinking' | 'generating' = 'connecting';
    const advancePhase = (next: typeof phase) => {
      if (phase !== next && !controller.signal.aborted) {
        phase = next;
        setGenerationPhase(next);
      }
    };

    const flushDelta = () => {
      frameRef.current = null;
      const text = deltaBuffer.current;
      if (!text) {
        return;
      }
      deltaBuffer.current = '';
      const id = targetIdRef.current;
      setMessages((prev) =>
        prev.map((item) => (item.id === id ? { ...item, content: item.content + text, status: 'running' } : item)),
      );
    };

    try {
      if (!convId) {
        const created = await createConversation(selectedAgentId);
        convId = created.id;
        setConversationId(created.id);
        setConversations((prev) => [created, ...prev]);
        setMessages((prev) => prev.map((item) =>
          item.id === userKey || item.id === assistantKey ? { ...item, conversationId: created.id } : item,
        ));
      }
      if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
      await streamMessage(
        convId,
        content,
        {
          onConnected: () => advancePhase('thinking'),
          onStarted: (assistantMessageId) => {
            if (controller.signal.aborted || !assistantMessageId) return;
            advancePhase('thinking');
            targetIdRef.current = assistantMessageId;
            setStreamingId(assistantMessageId);
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantKey ? { ...item, id: assistantMessageId } : item,
              ),
            );
          },
          onDelta: (chunk) => {
            if (controller.signal.aborted || !chunk) return;
            advancePhase('generating');
            deltaBuffer.current += chunk;
            if (frameRef.current !== null) {
              return;
            }
            frameRef.current = requestAnimationFrame(flushDelta);
          },
          onKnowledge: (_status, citations) => {
            if (controller.signal.aborted) return;
            const id = targetIdRef.current;
            if (!id) {
              return;
            }
            setCitationsByMessage((prev) => ({ ...prev, [id]: citations }));
          },
          onCompleted: (finalContent) => {
            if (controller.signal.aborted) return;
            terminalStatus = 'completed';
            // 后端给的全量优先，避免网络抖动丢过某个 delta
            if (frameRef.current !== null) {
              cancelAnimationFrame(frameRef.current);
              frameRef.current = null;
            }
            deltaBuffer.current = '';
            const id = targetIdRef.current;
            setMessages((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, content: finalContent || item.content, status: 'completed' }
                  : item,
              ),
            );
            setGenerationPhase(null);
            setStreamingId(null);
          },
          onFailed: (_code, message) => {
            if (controller.signal.aborted) return;
            terminalStatus = 'failed';
            if (frameRef.current !== null) {
              cancelAnimationFrame(frameRef.current);
              frameRef.current = null;
            }
            const rest = deltaBuffer.current;
            deltaBuffer.current = '';
            const id = targetIdRef.current;
            setSendError(message);
            setMessages((prev) =>
              prev.map((item) =>
                item.id === id ? { ...item, content: item.content + rest, status: 'failed' } : item,
              ),
            );
            setGenerationPhase(null);
            setStreamingId(null);
          },
        },
        controller.signal,
      );
    } catch (caught) {
      // 主动停止是正常路径，不弹错误
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) {
        terminalStatus = 'cancelled';
      } else {
        terminalStatus = 'failed';
        setSendError(caught instanceof ApiError ? caught.message : '发送失败，请稍后再试');
      }
    } finally {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      const rest = deltaBuffer.current;
      deltaBuffer.current = '';
      const id = targetIdRef.current;
      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== id || (item.status !== 'running' && item.status !== 'pending')) {
            return item;
          }
          const nextContent = item.content + rest;
          // 只有服务端明确 completed 才算完成；无终态断流不能因为已有部分文本就误判成功。
          const nextStatus: ChatMessage['status'] = terminalStatus ?? 'failed';
          return { ...item, content: nextContent, status: nextStatus };
        }),
      );
      if (!terminalStatus) setSendError('连接中断，请重试发送');
      abortRef.current = null;
      targetIdRef.current = null;
      setStreamingId(null);
      setGenerationPhase(null);
      sendingRef.current = false;
      setPreparingMessage(false);
      // 第一轮结束后标题会变，顺手刷新左侧列表
      void refreshConversations(agents);
    }
  };

  const handleStop = () => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const rest = deltaBuffer.current;
    deltaBuffer.current = '';
    const id = targetIdRef.current;
    setMessages((prev) => prev.map((item) => item.id === id
      ? { ...item, content: item.content + rest, status: 'cancelled' }
      : item));
    setStreamingId(null);
    setGenerationPhase(null);
  };

  const agentNames: Record<string, string> = Object.fromEntries(
    agents.map((agent) => [agent.id, agent.name]),
  );
  const activeTitle = conversations.find((item) => item.id === conversationId)?.title;
  const activeAgent = agents.find((agent) => agent.id === selectedAgentId);
  const chatBusy = preparingMessage || streamingId !== null || loadingConversation;
  const completedTurns = messages.reduce((count, message, index) => {
    const next = messages[index + 1];
    return count + (message.role === 'user' && next?.role === 'assistant' && next.status === 'completed' ? 1 : 0);
  }, 0);
  const contextRemaining = Math.max(0, CONTEXT_HISTORY_ROUND_LIMIT - completedTurns);
  const userPrompts = messages.filter((message) => message.role === 'user');
  const quickPrompts = [
    '帮我梳理今天最重要的三件事',
    '根据已有知识总结关键结论',
    '把这个想法拆成可执行步骤',
  ];

  return (
    <section className={styles.page} aria-label="智能体聊天">
      {historyOpen ? <button className={styles.historyBackdrop} type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭历史对话" /> : null}
      <ConversationList
        conversations={conversations}
        activeId={conversationId}
        agentNames={agentNames}
        disabled={chatBusy}
        onSelect={(id) => void handleSelectConversation(id)}
        onCreate={() => { handleNewConversation(); setHistoryOpen(false); }}
        onDelete={(item) => void handleDeleteConversation(item)}
        mobileOpen={historyOpen}
        onMobileClose={() => setHistoryOpen(false)}
      />

      <div className={styles.chat}>
        <header className={styles.header}>
          <button className={styles.historyToggle} type="button" onClick={() => setHistoryOpen(true)} aria-label="打开历史对话">
            <Icon name="chat" /><span>历史</span>
          </button>
          <div className={styles.heading}>
            <h1 className={styles.title}>{activeTitle || '智能体对话'}</h1>
            <p className={styles.subtitle}>
              {activeAgent?.description || (conversationId ? '消息存在你的账号下，刷新不丢' : '新对话：发第一条消息后自动保存')}
            </p>
          </div>
          <label className={styles.agentPicker}>
            <span className={styles.agentAvatar} aria-hidden="true">{activeAgent?.name.slice(0, 1).toUpperCase() || 'AI'}</span>
            <span className={styles.agentPickerText}>当前智能体</span>
            <select
              value={selectedAgentId}
              disabled={chatBusy || agents.length === 0}
              onChange={(event) => handleAgentChange(event.target.value)}
              aria-label="选择智能体"
            >
              {agents.length === 0 ? <option value="">暂无智能体</option> : null}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <span className={`${styles.badge}${streamingId ? ` ${styles.badgeActive}` : ''}`}>
            <span className={styles.badgeDot} aria-hidden="true" />
            {generationPhase === 'connecting' ? '正在连接' : generationPhase === 'thinking' ? '正在思考' : generationPhase === 'generating' ? '正在生成' : '准备就绪'}
          </span>
        </header>

        <div className={styles.streamFrame}>
          {userPrompts.length > 0 ? (
            <nav className={styles.turnRail} aria-label="本轮对话提问">
              {userPrompts.map((message, index) => (
                <button
                  key={message.id}
                  ref={(element) => {
                    if (element) promptMarkRefs.current.set(message.id, element);
                    else promptMarkRefs.current.delete(message.id);
                  }}
                  type="button"
                  className={`${styles.turnMark}${activePromptId === message.id ? ` ${styles.turnMarkActive}` : ''}`}
                  title={`第 ${index + 1} 轮：${message.content}`}
                  aria-label={`跳转到第 ${index + 1} 轮提问：${message.content}`}
                  aria-current={activePromptId === message.id ? 'location' : undefined}
                  onClick={() => promptRefs.current.get(message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                />
              ))}
            </nav>
          ) : <div aria-hidden="true" />}
          <div className={styles.stream} ref={streamRef} onScroll={handleStreamScroll}>
          {loadingConversation ? <div className={styles.chatLoading}><span /><span /><span /><p>正在加载对话</p></div> : null}
          {!loadingConversation && messages.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <Icon name="chat" />
              </span>
              {agents.length === 0 ? (
                <>
                  <strong>先创建一个智能体</strong>
                  <p>配置角色和能力后，就可以在这里开始对话。</p>
                  <button className={styles.emptyPrimary} type="button" onClick={() => navigate('/workspace/agents')}>去创建智能体</button>
                </>
              ) : (
                <>
                  <strong>{activeAgent?.openingMessage || `和 ${activeAgent?.name || '智能体'} 开始对话`}</strong>
                  <p>可以直接描述目标，也可以从下面的灵感开始。</p>
                  <div className={styles.promptGrid}>
                    {quickPrompts.map((prompt) => <button type="button" key={prompt} disabled={chatBusy} onClick={() => void handleSend(prompt)}>{prompt}<span>↗</span></button>)}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {!loadingConversation ? messages.map((message, index) => (
            <div
              key={message.id}
              ref={message.role === 'user' ? (element) => {
                if (element) promptRefs.current.set(message.id, element);
                else promptRefs.current.delete(message.id);
              } : undefined}
              className={message.role === 'user' ? styles.userTurnAnchor : undefined}
            >
              <ChatBubble
                message={message}
                phase={message.id === streamingId ? generationPhase ?? undefined : undefined}
                onRetry={(message.status === 'failed' || ((message.status === 'pending' || message.status === 'running') && message.id !== streamingId)) && messages[index - 1]?.role === 'user' && !chatBusy
                  ? () => void handleSend(messages[index - 1].content)
                  : undefined}
              />
              {citationsByMessage[message.id]?.length ? (
                <div className={styles.citations} aria-label="本次检索来源">
                  来源：{citationsByMessage[message.id].map((source) => source.title).join('、')}
                </div>
              ) : null}
            </div>
          )) : null}

          <div ref={bottomRef} />
          </div>
        </div>

        {showScrollJump ? <button className={styles.scrollJump} type="button" onClick={() => { atBottomRef.current = true; setShowScrollJump(false); bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }}>回到底部 ↓</button> : null}

        <div className={styles.footer}>
          {bootError ? (
            <p className={styles.alert} role="alert">
              {bootError}
            </p>
          ) : null}
          {sendError ? (
            <p className={styles.alert} role="alert">
              {sendError}
            </p>
          ) : null}

          {streamingId ? (
            <div className={styles.stopRow}>
              <button className={styles.stop} type="button" onClick={handleStop}>
                停止生成
              </button>
            </div>
          ) : null}

          <MessageComposer
            disabled={!selectedAgentId || chatBusy}
            contextRemaining={contextRemaining}
            contextMax={CONTEXT_HISTORY_ROUND_LIMIT}
            onSend={(content) => void handleSend(content)}
          />
          <p className={styles.composerHint}>AI 生成内容可能不准确，请核对重要信息。</p>
        </div>
      </div>
    </section>
  );
}
