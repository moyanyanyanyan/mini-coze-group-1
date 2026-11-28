import { useEffect, useState } from 'react';
import type { ConversationMemory } from '@minicoze/shared';
import { getConversationMemory } from './api/chat-api';

export function useConversationMemory(conversationId: string | null, busy: boolean) {
  const [result, setResult] = useState<{ id: string; memory?: ConversationMemory; error?: string }>();
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!conversationId || busy) return;
    let active = true;
    setLoading(true);
    void getConversationMemory(conversationId).then(memory => {
      if (active) setResult({ id: conversationId, memory });
    }).catch((error: unknown) => {
      if (active) setResult({ id: conversationId, error: error instanceof Error ? error.message : '读取记忆失败' });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId, busy, attempt]);
  return { ...(result?.id === conversationId && !busy ? result : {}), loading: loading || busy, refresh: () => setAttempt(n => n + 1) };
}
