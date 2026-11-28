import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ConversationSummary } from '@minicoze/shared';
import { ApiError } from '../../shared/api/http';
import { listAgents, type Agent, type AgentStatus } from '../agent-builder/agent.api';
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  renameConversation,
  streamMessage,
  uploadAttachment,
  type ChatCitation,
  type PendingAttachment,
} from './api/chat-api';
import { estimateConversationTokens, getContextTokenLimit } from './context-usage';
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

async function listEveryAgent(status?: AgentStatus): Promise<Agent[]> {
  const agents: Agent[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ page: String(page), pageSize: '100' });
    if (status) params.set('status', status);
    const result = await listAgents(params);
    agents.push(...result.items);
    if (agents.length >= result.total || result.items.length === 0) return agents;
    page += 1;
  }
}

function rememberChatLocation(agentId: string | null, conversationId: string | null): void {
  const url = new URL(window.location.href);
  if (agentId) url.searchParams.set('agentId', agentId);
  else url.searchParams.delete('agentId');
  if (conversationId) url.searchParams.set('conversation', conversationId);
  else url.searchParams.delete('conversation');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function AgentChatPage() {
  const { confirm, confirmation } = useConfirm();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{ conversationId: string | null; usedTokens: number; source: 'actual' | 'estimated' } | null>(null);
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
  const uploadingRef = useRef(false);

  /** 切会话/切智能体/新建时，未发送的附件没有归属，直接丢掉 */
  const clearPendingAttachments = () => {
    uploadEpoch.current += 1;
    uploadingRef.current = false;
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
      const [available, existing] = await Promise.all([listEveryAgent(), listConversations()]);
      const historicalAgentIds = new Set(existing.map((item) => item.agentId).filter((id): id is string => Boolean(id)));
      const needsArchived = [...historicalAgentIds].some((id) => !available.some((agent) => agent.id === id));
      const archived = needsArchived ? (await listEveryAgent('ARCHIVED')).filter((agent) => historicalAgentIds.has(agent.id)) : [];
      const allAgents = [...available, ...archived];
      const target = new URLSearchParams(window.location.search).get('agentId');
      if (request !== requestId.current) return;
      setAgents(allAgents);
      setNeedsAgent(available.length === 0);
      const requested = new URLSearchParams(window.location.search).get('conversation');
      const conversation = requested
        ? existing.find((item) => item.id === requested)
        : target ? undefined : existing[0];
      const history = conversation ? await listMessages(conversation.id) : [];
      if (request !== requestId.current) return;
      following.current = true;
      setConversations(existing);
      const agentId = conversation
        ? conversation.agentId ?? ''
        : (available.some((agent) => agent.id === target) ? target : null) ?? available[0]?.id ?? '';
      setSelectedAgentId(agentId);
      setConversationId(conversation?.id ?? null);
      setMessages(history);
      const agent = allAgents.find((item) => item.id === agentId);
      setTokenUsage({ conversationId: conversation?.id ?? null, usedTokens: estimateConversationTokens(history, agent?.systemPrompt, Math.min(agent?.contextLimit ?? 10, 10)), source: 'estimated' });
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof ApiError ? caught.message : '会话加载失败，请稍后再试');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  }, []);

  const handleAgentChange = async (agentId: string) => {
    if (sendingRef.current || switching || uploadingRef.current) return;
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
      const agent = agents.find((item) => item.id === agentId);
      setTokenUsage({ conversationId: conversation.id, usedTokens: estimateConversationTokens(history, agent?.systemPrompt, Math.min(agent?.contextLimit ?? 10, 10)), source: 'estimated' });
      setCitationsByMessage({});
      rememberChatLocation(agentId, conversation.id);
      jumpToLatest();
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof Error ? caught.message : '切换智能体失败');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  };

  const handleConversationChange = async (conversation: ConversationSummary) => {
    if (sendingRef.current || uploadingRef.current || streamingId || (conversation.id === conversationId && !switching)) {
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
      rememberChatLocation(conversation.agentId, conversation.id);
      const agent = agents.find((item) => item.id === conversation.agentId);
      setTokenUsage({ conversationId: conversation.id, usedTokens: estimateConversationTokens(history, agent?.systemPrompt, Math.min(agent?.contextLimit ?? 10, 10)), source: 'estimated' });
      setCitationsByMessage({});
    } catch (caught) {
      if (request === requestId.current) setBootError(caught instanceof Error ? caught.message : '会话加载失败');
    } finally {
      if (request === requestId.current) setSwitching(false);
    }
  };

  const handleNewConversation = async () => {
    if (!selectedAgent || selectedAgent.status === 'ARCHIVED' || sendingRef.current || uploadingRef.current || streamingId || switching) return;
    const request = ++requestId.current;
    setBootError('');
    setSendError('');
    clearPendingAttachments();
    setSwitching(true);
    try {
      const conversation = await createConversation(selectedAgent.id);
      if (request !== requestId.current) return;
      setConversations((items) => [conversation, ...items]);
      setConversationId(conversation.id);
      setMessages([]);
      setTokenUsage({ conversationId: conversation.id, usedTokens: 0, source: 'estimated' });
      rememberChatLocation(conversation.agentId, conversation.id);
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
    if (sendingRef.current || uploadingRef.current || streamingId || switching) {
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
        const fallback = next.find((item) => item.agentId === conversation.agentId) ?? next[0];
        if (fallback) {
          await handleConversationChange(fallback);
        } else {
          clearPendingAttachments();
          const agentId = agents.find((agent) => agent.id === selectedAgentId && agent.status !== 'ARCHIVED')?.id
            ?? agents.find((agent) => agent.status !== 'ARCHIVED')?.id ?? '';
          setConversationId(null);
          setSelectedAgentId(agentId);
          setMessages([]);
          setTokenUsage({ conversationId: null, usedTokens: 0, source: 'estimated' });
          setCitationsByMessage({});
          rememberChatLocation(agentId, null);
        }
      }
    } catch (caught) {
      setBootError(caught instanceof Error ? caught.message : '删除会话失败');
    }
  };

  const handleRenameConversation = async (id: string, title: string): Promise<boolean> => {
    try {
      const updated = await renameConversation(id, title.trim());
      setConversations((prev) => prev.map((item) => item.id === id ? updated : item)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
      return true;
    } catch (caught) {
      setBootError(caught instanceof Error ? caught.message : '重命名失败');
      return false;
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
    if (files.length === 0 || !selectedAgent || selectedAgent.status === 'ARCHIVED'
      || switching || streamingId || sendingRef.current || uploadingRef.current) {
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
    uploadingRef.current = true;
    setAttaching(true);
    try {
      let targetConversationId = conversationId;
      if (!targetConversationId) {
        const created = await createConversation(selectedAgent.id);
        if (epoch !== uploadEpoch.current) return;
        targetConversationId = created.id;
        setConversationId(created.id);
        setConversations((prev) => [created, ...prev]);
        setTokenUsage({ conversationId: created.id, usedTokens: 0, source: 'estimated' });
        rememberChatLocation(created.agentId, created.id);
      }
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
          if (uploaded.status === 'FAILED') {
            setAttachmentError(uploaded.errorMessage || `${file.name} 解析失败，请移除后重试`);
          }
        } catch (caught) {
          if (epoch !== uploadEpoch.current) {
            break;
          }
          setAttachmentError(caught instanceof ApiError ? caught.message : `${file.name} 上传失败`);
        }
      }
    } catch (caught) {
      if (epoch === uploadEpoch.current) {
        setAttachmentError(caught instanceof Error ? caught.message : '创建会话失败，无法上传附件');
      }
    } finally {
      if (epoch === uploadEpoch.current) {
        uploadingRef.current = false;
        setAttaching(false);
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
    setAttachmentError('');
  };

  const handleSend = async (content: string) => {
    if (streamingId || sendingRef.current || switching || !selectedAgent || selectedAgent.status === 'ARCHIVED') {
      return;
    }
    if (!content.trim() && pendingAttachments.length === 0) return;
    if (attaching || uploadingRef.current) {
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
    const retryHint = attachmentIds.length > 0 ? ' 如需重试，请重新上传附件。' : '';
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
    const contextTurns = Math.min(selectedAgent?.contextLimit ?? CONTEXT_HISTORY_ROUND_LIMIT, CONTEXT_HISTORY_ROUND_LIMIT);
    const pendingUser: ChatMessage = { id: userKey, conversationId: convId ?? '', role: 'user', status: 'completed', seq: -2, content, createdAt: now };
    setTokenUsage({ conversationId: convId, usedTokens: estimateConversationTokens([...messages, pendingUser], selectedAgent?.systemPrompt, contextTurns), source: 'estimated' });
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
              errorMessage: attachment.errorMessage,
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
        rememberChatLocation(created.agentId, created.id);
        setTokenUsage((current) => current ? { ...current, conversationId: created.id } : current);
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
          onCompleted: (finalContent, usage) => {
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
            const completed: ChatMessage = {
              ...pendingUser,
              role: 'assistant',
              id: targetIdRef.current ?? assistantKey,
              seq: -1,
              content: finalContent,
              status: 'completed',
            };
            setTokenUsage({
              conversationId: convId,
              usedTokens: usage?.totalTokens ?? estimateConversationTokens([...messages, pendingUser, completed], selectedAgent?.systemPrompt, contextTurns),
              source: usage ? 'actual' : 'estimated',
            });
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
            setSendError(`${message}${retryHint}`);
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
        setSendError(caught instanceof ApiError ? caught.message : `发送失败，请稍后再试。${retryHint}`);
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
      if (!terminalStatus) setSendError(`连接中断，请重试发送。${retryHint}`);
      abortRef.current = null;
      targetIdRef.current = null;
      setStreamingId(null);
      setGenerationPhase(null);
      sendingRef.current = false;
      setPreparingMessage(false);
      // 第一轮结束后标题会变，顺手刷新左侧列表
      void listConversations().then(setConversations).catch(() => undefined);
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
  const contextMax = Math.min(selectedAgent?.contextLimit ?? CONTEXT_HISTORY_ROUND_LIMIT, CONTEXT_HISTORY_ROUND_LIMIT);
  const contextRemaining = Math.max(0, contextMax - completedTurns);
  const contextUsage = {
    usedTokens: tokenUsage?.conversationId === conversationId ? tokenUsage.usedTokens : null,
    maxTokens: getContextTokenLimit(selectedAgent),
    source: tokenUsage?.source ?? 'estimated',
  } as const;

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
      contextMax={contextMax}
      contextUsage={contextUsage}
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
      handleRenameConversation={handleRenameConversation}
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
