import { useCallback, useEffect, useState } from 'react';
import { get } from '../../shared/api/http';

export type ChatReadiness = 'starting' | 'ready' | 'failed' | 'unavailable';

export function useChatReadiness() {
  const [status, setStatus] = useState<ChatReadiness>('starting');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setStatus('starting'); setRevision(value => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      let next: ChatReadiness = 'unavailable';
      try {
        const result = await get<{ status: ChatReadiness }>('/api/chat/readiness', AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
        if (['starting', 'ready', 'failed', 'unavailable'].includes(result.status)) next = result.status;
      } catch {
        // 连接失败也必须关闭发送入口，后续轮询负责恢复。
        next = 'unavailable';
      }
      if (controller.signal.aborted) return;
      setStatus(next);
      timer = setTimeout(() => void check(), next === 'ready' ? 10000 : 2000);
    };
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  return { status, refresh };
}
