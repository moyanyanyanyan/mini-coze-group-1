import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentOption, ApiKey } from '../api/api-keys.types';
import { getAgentOptions, getApiKeyList } from '../api/api-keys.service';

export type ApiKeyListStatus = 'loading' | 'ready' | 'error';

export function useApiKeys() {
  const [records, setRecords] = useState<ApiKey[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [status, setStatus] = useState<ApiKeyListStatus>('loading');
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setStatus('loading');

    try {
      const [nextRecords, nextAgents] = await Promise.all([
        getApiKeyList(),
        getAgentOptions(),
      ]);

      if (requestId !== latestRequest.current) {
        return false;
      }

      setRecords(nextRecords);
      setAgents(nextAgents);
      setStatus('ready');
      return true;
    } catch {
      if (requestId !== latestRequest.current) {
        return false;
      }

      setRecords([]);
      setAgents([]);
      setStatus('error');
      return false;
    }
  }, []);

  useEffect(() => {
    void refresh();

    return () => {
      latestRequest.current += 1;
    };
  }, [refresh]);

  const removeRecord = useCallback((id: string) => {
    setRecords((current) => current.filter((apiKey) => apiKey.id !== id));
  }, []);

  return {
    records,
    agents,
    status,
    refresh,
    removeRecord,
  };
}
