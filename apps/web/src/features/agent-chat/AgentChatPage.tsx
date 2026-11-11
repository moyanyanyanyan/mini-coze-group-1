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
import { AppLink } from '../../shared/routing/AppLink';
import { useConfirm } from '@minicoze/ui/hooks';
import { AgentChatView, useChatViewport } from '@minicoze/ui/agent-chat';

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
  const [needsAgent, setNeedsAgent] = useState(false);
  const [bootError, setBootError] = useState('');
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId);
  const suggestedPrompts = selectedAgent?.knowledgeBaseBindings.some(binding => binding.enabled)
    ? [SUGGESTED_PROMPTS[0], '根据知识库总结重点', SUGGESTED_PROMPTS[2]] : SUGGESTED_PROMPTS;

  const viewport = useChatViewport(messages, streamingId);
  const { following, setAwayFromBottom, jumpToLatest, closeConversationDrawer } = viewport;
  const requestId = useRef(0);
  const [switching, setSwitching] = useState(false);
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
      if (request !== requestId.current) return;
      setAgents(available);
      setNeedsAgent(available.length === 0);
      if (available.length === 0) return;
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
      closeConversationDrawer();
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
      closeConversationDrawer();
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
    <AgentChatView
      conversationId={conversationId}
      conversations={conversations}
      agents={agents}
      selectedAgentId={selectedAgentId}
      messages={messages}
      citationsByMessage={citationsByMessage}
      streamingId={streamingId}
      sendError={sendError}
      needsAgent={needsAgent}
      bootError={bootError}
      switching={switching}
      suggestedPrompts={suggestedPrompts}
      viewport={viewport}
      confirmation={confirmation}
      LinkComponent={AppLink}
      createAgentRoute="/workspace/agents/create?action=new"
      handleNewConversation={handleNewConversation}
      handleConversationChange={(id) => {
        const conversation = conversations.find((item) => item.id === id);
        if (conversation) void handleConversationChange(conversation);
      }}
      handleDeleteConversation={(id) => {
        const conversation = conversations.find((item) => item.id === id);
        if (conversation) void handleDeleteConversation(conversation);
      }}
      handleAgentChange={handleAgentChange}
      handleSend={handleSend}
      handleStop={handleStop}
      onRetry={() => { setBootError(''); void boot(); }}
    />
  );
}
