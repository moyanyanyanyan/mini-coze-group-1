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
  uploadAttachment,
  type ChatCitation,
  type PendingAttachment,
} from './api/chat-api';
import { AppLink } from '../../shared/routing/AppLink';
import { useConfirm } from '@minicoze/ui/hooks';
import { AgentChatView, useChatViewport } from '@minicoze/ui/agent-chat';

const SUGGESTED_PROMPTS = [
  '介绍一下你能帮我做什么',
  '帮我梳理一个问题的思路',
  '帮我规划下一步任务',
];

const CONTEXT_HISTORY_ROUND_LIMIT = 10;
/** 与后端 SendMessageDto 的 ArrayMaxSize(5) 保持一致 */
const MAX_ATTACHMENTS = 5;

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
  const [generationPhase, setGenerationPhase] = useState<'connecting' | 'thinking' | 'generating' | null>(null);
  const [preparingMessage, setPreparingMessage] = useState(false);
  const [sendError, setSendError] = useState('');
  /** 待发送附件：上传成功即进列表，发送后清空 */
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [needsAgent, setNeedsAgent] = useState(false);
  const [bootError, setBootError] = useState('');
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId);
  const suggestedPrompts = selectedAgent?.knowledgeBaseBindings.some(binding => binding.enabled)
    ? [SUGGESTED_PROMPTS[0], '根据知识库总结重点', SUGGESTED_PROMPTS[2]] : SUGGESTED_PROMPTS;

  const viewport = useChatViewport(messages, streamingId);
  const { following, setAwayFromBottom, jumpToLatest, closeConversationDrawer } = viewport;
  const requestId = useRef(0);
  const [switching, setSwitching] = useState(false);

  /** 切换会话后自增，用于丢弃旧会话的在途上传结果 */
  const uploadEpoch = useRef(0);

  /** 切会话/切智能体/新建时，未发送的附件没有归属，直接丢掉 */
  const clearPendingAttachments = () => {
    uploadEpoch.current += 1;
    setPendingAttachments([]);
    setAttachmentError('');
    setAttaching(false);
  };
  // React 严格模式下 effect 会跑两次，没有这个闸门就会建出两个会话
  const booted = useRef(false);
  // C4 接缝：同一个 AbortController 贯穿整轮。
  //   前端 abort → fetch 断连 → 后端 res.on('close') → Runtime 那条 HTTP 也断
  const abortRef = useRef<AbortController | null>(null);

  const deltaBuffer = useRef('');
  const frameRef = useRef<number | null>(null);
  const targetIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

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
      const usable = existing.filter((item) => item.agentId && available.some((agent) => agent.id === item.agentId));
      const requested = new URLSearchParams(window.location.search).get('conversation');
      const conversation = usable.find((item) => item.id === requested)
        ?? usable.find((item) => !target || item.agentId === target);
      const history = conversation ? await listMessages(conversation.id) : [];
      if (request !== requestId.current) return;
      following.current = true;
      setConversations(usable);
      setSelectedAgentId(conversation?.agentId ?? target ?? available[0].id);
      setConversationId(conversation?.id ?? null);
      setMessages(history);
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof ApiError ? caught.message : '会话加载失败，请稍后再试');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  }, []);

  const handleAgentChange = async (agentId: string) => {
    if (sendingRef.current || switching) return;
    const request = ++requestId.current;
    setSwitching(true);
    setSendError('');
    setBootError('');
    clearPendingAttachments();
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
      jumpToLatest();
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof Error ? caught.message : '切换智能体失败');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  };

  const handleConversationChange = async (conversation: ConversationSummary) => {
    if (sendingRef.current || streamingId || (conversation.id === conversationId && !switching)) {
      return;
    }
    setBootError('');
    setSendError('');
    clearPendingAttachments();
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
    if (!selectedAgentId || sendingRef.current || streamingId || switching) return;
    const request = ++requestId.current;
    setBootError('');
    setSendError('');
    clearPendingAttachments();
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
    if (sendingRef.current || streamingId || switching) {
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

  const handleSelectFiles = async (files: File[]) => {
    if (!conversationId || files.length === 0) {
      return;
    }
    const room = MAX_ATTACHMENTS - pendingAttachments.length;
    if (room <= 0) {
      setAttachmentError('单条消息最多 5 个附件');
      return;
    }
    setAttachmentError('');
    if (files.length > room) {
      setAttachmentError('单条消息最多 5 个附件，超出的文件未添加');
    }
    // 串行上传：一次一个请求，失败只影响当前文件
    const epoch = uploadEpoch.current;
    const targetConversationId = conversationId;
    setAttaching(true);
    try {
      for (const file of files.slice(0, room)) {
        if (epoch !== uploadEpoch.current) {
          break;
        }
        try {
          const uploaded = await uploadAttachment(targetConversationId, file);
          if (epoch !== uploadEpoch.current) {
            break;
          }
          setPendingAttachments((prev) => [...prev, uploaded]);
        } catch (caught) {
          if (epoch !== uploadEpoch.current) {
            break;
          }
          setAttachmentError(caught instanceof ApiError ? caught.message : `${file.name} 上传失败`);
        }
      }
    } finally {
      if (epoch === uploadEpoch.current) {
        setAttaching(false);
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
    setAttachmentError('');
  };

  const handleSend = async (content: string) => {
    if (streamingId || sendingRef.current || switching || !selectedAgentId) {
      return;
    }
    if (attaching) {
      setSendError('附件还在解析中，请稍候再发送');
      return;
    }
    const blocked = pendingAttachments.find((attachment) => attachment.status !== 'READY');
    if (blocked) {
      setSendError('请先移除解析失败的附件');
      return;
    }

    // 本轮要绑定的附件；发送失败（HTTP 层）时恢复，便于重试
    const sendingAttachments = pendingAttachments;
    const attachmentIds = sendingAttachments.map((attachment) => attachment.id);
    sendingRef.current = true;
    setPreparingMessage(true);
    setSendError('');
    setAttachmentError('');
    following.current = true;
    setAwayFromBottom(false);

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
        attachments: sendingAttachments.length > 0
          ? sendingAttachments.map((attachment) => ({
              id: attachment.id,
              fileName: attachment.fileName,
              sourceType: attachment.sourceType,
              byteSize: attachment.byteSize,
              status: 'READY' as const,
              errorCode: attachment.errorCode,
            }))
          : undefined,
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
    // 发送即清空输入区；失败时再恢复
    setPendingAttachments([]);

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
        attachmentIds.length > 0 ? { attachmentIds } : undefined,
      );
    } catch (caught) {
      // 主动停止是正常路径，不弹错误
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) {
        terminalStatus = 'cancelled';
      } else {
        terminalStatus = 'failed';
        setSendError(caught instanceof ApiError ? caught.message : '发送失败，请稍后再试');
        // 只有请求在 SSE 建立前就被拒（400/413…）时附件仍未绑定，才值得恢复
        if (caught instanceof ApiError) {
          setPendingAttachments(sendingAttachments);
        }
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
      void listConversations().then((items) => setConversations(items.filter((item) => item.agentId && agents.some((agent) => agent.id === item.agentId)))).catch(() => undefined);
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

  const completedTurns = messages.reduce((count, message, index) => count + (
    message.role === 'user' && messages[index + 1]?.role === 'assistant'
      && messages[index + 1].status === 'completed' ? 1 : 0
  ), 0);
  const contextRemaining = Math.max(0, CONTEXT_HISTORY_ROUND_LIMIT - completedTurns);

  return (
    <AgentChatView
      conversationId={conversationId}
      conversations={conversations}
      agents={agents}
      selectedAgentId={selectedAgentId}
      messages={messages}
      citationsByMessage={citationsByMessage}
      streamingId={streamingId}
      generationPhase={generationPhase}
      contextRemaining={contextRemaining}
      contextMax={CONTEXT_HISTORY_ROUND_LIMIT}
      sendError={sendError}
      needsAgent={needsAgent}
      bootError={bootError}
      switching={switching || preparingMessage}
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
      pendingAttachments={pendingAttachments}
      attaching={attaching}
      attachmentError={attachmentError}
      onSelectFiles={(files) => void handleSelectFiles(files)}
      onRemoveAttachment={handleRemoveAttachment}
    />
  );
}
