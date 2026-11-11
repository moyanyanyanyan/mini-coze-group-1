import { useEffect, useRef, useState } from 'react';
import { useOverlayFocus } from '../../hooks/useOverlayFocus';
import type { ChatMessageView } from './types';

export function useChatViewport(messages: readonly ChatMessageView[], streamingId: string | null) {
  const streamRef = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1200);
  const conversationPanelRef = useRef<HTMLElement>(null);
  const conversationDrawer = conversationsOpen && typeof window !== 'undefined' && window.innerWidth < 1200;
  useOverlayFocus(conversationPanelRef, conversationDrawer, () => setConversationsOpen(false));
  const jumpToLatest = () => {
    following.current = true;
    setAwayFromBottom(false);
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  };
  // 只滚动消息容器；阅读历史时不抢走用户的滚动位置。
  useEffect(() => {
    if (following.current) jumpToLatest();
  }, [messages, streamingId]);

  const closeConversationDrawer = () => {
    if (window.innerWidth < 1200) setConversationsOpen(false);
  };
  const onScroll = () => {
    const el = streamRef.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    setAwayFromBottom(!following.current);
  };
  return { streamRef, following, awayFromBottom, setAwayFromBottom, conversationsOpen,
    setConversationsOpen, conversationPanelRef, conversationDrawer, jumpToLatest, closeConversationDrawer, onScroll };
}

export type ChatViewport = ReturnType<typeof useChatViewport>;
