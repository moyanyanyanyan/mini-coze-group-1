import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApiKey,
  deleteApiKey,
  getAgentOptions,
  getApiKeyList,
  updateApiKeyName,
} from './api-keys.service';

function envelope<T>(status: number, data: T) {
  return new Response(JSON.stringify({ code: status, message: 'ok', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API Key service', () => {
  it('loads Agent options from the current user Agent list', async () => {
    const fetchMock = vi.fn(async () => envelope(200, {
      items: [{ id: 'agent-1', name: 'Agent One' }],
      total: 1,
      page: 1,
      pageSize: 100,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAgentOptions()).resolves.toEqual([
      { id: 'agent-1', name: 'Agent One' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agents',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads API Keys through cookie authentication', async () => {
    const keys = [{
      id: 'key-1',
      agentId: 'agent-1',
      agentName: 'Agent One',
      name: 'Production',
      maskedKey: 'mk_live_abcd••••••••',
      createdAt: '2026-11-02T00:00:00.000Z',
      lastUsedAt: null,
    }];
    vi.stubGlobal('fetch', vi.fn(async () => envelope(200, keys)));

    await expect(getApiKeyList()).resolves.toEqual(keys);
  });

  it('creates a key for the selected Agent', async () => {
    const result = {
      apiKey: {
        id: 'key-1',
        agentId: 'agent-1',
        agentName: 'Agent One',
        name: 'Production',
        maskedKey: 'mk_live_abcd••••••••',
        createdAt: '2026-11-02T00:00:00.000Z',
        lastUsedAt: null,
      },
      secret: 'mk_live_placeholder',
    };
    const fetchMock = vi.fn(async () => envelope(201, result));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createApiKey('agent-1', 'Production')).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agents/agent-1/api-keys',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Production' }),
        credentials: 'include',
      }),
    );
  });

  it('renames and revokes a key through PATCH and DELETE', async () => {
    const updated = {
      id: 'key-1',
      agentId: 'agent-1',
      agentName: 'Agent One',
      name: 'Renamed',
      maskedKey: 'mk_live_abcd••••••••',
      createdAt: '2026-11-02T00:00:00.000Z',
      lastUsedAt: null,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(envelope(200, updated))
      .mockResolvedValueOnce(envelope(200, { id: 'key-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateApiKeyName('key-1', 'Renamed')).resolves.toEqual(updated);
    await expect(deleteApiKey('key-1')).resolves.toEqual({ id: 'key-1' });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });
});
