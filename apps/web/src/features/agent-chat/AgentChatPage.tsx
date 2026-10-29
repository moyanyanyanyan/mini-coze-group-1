import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@minicoze/shared';
import { ApiError } from '../../shared/api/http';
import { listAgents, type Agent } from '../agent-builder/agent.api';
import {
  createConversation,
  listConversations,
  listMessages,
  streamMessage,
  type ChatCitation,
} from './api/chat-api';
import { ChatBubble } from './components/ChatBubble';
import { MessageComposer } from './components/MessageComposer';
import styles from './agent-chat.module.css';

export function AgentChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citationsByMessage, setCitationsByMessage] = useState<Record<string, ChatCitation[]>>({});
  /** 非空 = 这一轮还在生成。同时也用作「禁止再发」的闸门 */
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState('');
  const [bootError, setBootError] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);
  // React 严格模式下 effect 会跑两次，没有这个闸门就会建出两个会话
  const booted = useRef(false);
  // C4 接缝：同一个 AbortController 贯穿整轮。
  //   前端 abort → fetch 断连 → 后端 res.on('close') → Runtime 那条 HTTP 也断
  const abortRef = useRef<AbortController | null>(null);

  const boot = useCallback(async () => {
    try {
      const [agentPage, existing] = await Promise.all([listAgents(), listConversations()]);
      const available = agentPage.items.filter((agent) => agent.status !== 'ARCHIVED');
      setAgents(available);
      if (available.length === 0) {
        setBootError('请先在智能体页面创建一个智能体');
        return;
      }
      const conversation = existing.find((item) => available.some((agent) => agent.id === item.agentId))
        ?? (await createConversation(available[0].id));

      setSelectedAgentId(conversation.agentId ?? available[0].id);
      setConversationId(conversation.id);
      setMessages(await listMessages(conversation.id));
    } catch (caught) {
      setBootError(caught instanceof ApiError ? caught.message : '会话加载失败，请稍后再试');
    }
  }, []);

  const handleAgentChange = async (agentId: string) => {
    setBootError('');
    try {
      const existing = await listConversations();
      const conversation = existing.find((item) => item.agentId === agentId)
        ?? (await createConversation(agentId));
      const history = await listMessages(conversation.id);
      setSelectedAgentId(agentId);
      setConversationId(conversation.id);
      setMessages(history);
      setCitationsByMessage({});
    } catch (caught) {
      setBootError(caught instanceof Error ? caught.message : '切换智能体失败');
    }
  };

  useEffect(() => {
    if (booted.current) {
      return;
    }
    booted.current = true;
    void boot();
  }, [boot]);

  // 有新内容就滚到底部，聊天页不能让人手动往下拖
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streamingId]);

  const handleSend = async (content: string) => {
    if (!conversationId || streamingId) {
      return;
    }

    setSendError('');

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
    <section className={styles.page} aria-label="智能体聊天">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>智能体对话</h1>
          <p className={styles.subtitle}>
            {conversationId ? '消息存在你的账号下，刷新不丢' : '正在准备会话…'}
          </p>
        </div>
        <label>
          选择智能体{' '}
          <select
            value={selectedAgentId}
            disabled={streamingId !== null || agents.length === 0}
            onChange={(event) => void handleAgentChange(event.target.value)}
          >
            {agents.length === 0 ? <option value="">暂无智能体</option> : null}
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </label>
        <span className={styles.badge}>C6 · 流式生成</span>
      </header>

      <div className={styles.stream}>
        {messages.length === 0 ? (
          <p className={styles.empty}>还没有消息。发一条试试，回答会一个字一个字出来。</p>
        ) : null}

        {messages.map((message) => (
          <div key={message.id}>
            <ChatBubble message={message} />
            {citationsByMessage[message.id]?.length ? (
              <div aria-label="本次检索来源">
                来源：{citationsByMessage[message.id].map((source) => source.title).join('、')}
              </div>
            ) : null}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className={styles.footer}>
        {bootError ? <p className={styles.alert} role="alert">{bootError}</p> : null}
        {sendError ? <p className={styles.alert} role="alert">{sendError}</p> : null}

        {streamingId ? (
          <div className={styles.stopRow}>
            <button className={styles.stop} type="button" onClick={handleStop}>
              停止生成
            </button>
          </div>
        ) : null}

        <MessageComposer
          disabled={!conversationId || streamingId !== null}
          onSend={(content) => void handleSend(content)}
        />
      </div>
    </section>
  );
}
