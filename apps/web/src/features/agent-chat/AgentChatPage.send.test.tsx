import { beforeEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cursor: 0,
  values: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  stream: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    const setter = harness.setters[index] ??= vi.fn();
    return [harness.values[index] ?? initial, setter];
  },
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => undefined,
  useCallback: (callback: unknown) => callback,
}));
vi.mock('@minicoze/ui/hooks', () => ({ useConfirm: () => ({ confirm: vi.fn(), confirmation: null }) }));
vi.mock('@minicoze/ui/agent-chat', () => ({
  AgentChatView: () => null,
  ConversationMemory: () => null,
  useChatViewport: () => ({ following: { current: true }, setAwayFromBottom: vi.fn() }),
}));
vi.mock('./use-chat-readiness', () => ({
  useChatReadiness: () => ({ status: 'ready', refresh: harness.refresh }),
}));
vi.mock('./api/chat-api', async importOriginal => ({
  ...await importOriginal<typeof import('./api/chat-api')>(),
  streamMessage: harness.stream,
}));

import { ApiError } from '../../shared/api/http';
import { AgentChatPage } from './AgentChatPage';

const attachment = { id: 'attachment', fileName: '说明.md', sourceType: 'MD', byteSize: 10, status: 'READY' };

beforeEach(() => {
  vi.clearAllMocks();
  harness.stream.mockReset();
  harness.cursor = 0;
  harness.setters = [];
  harness.values = ['conversation', [], [{ id: 'agent', status: 'PUBLISHED', contextLimit: 10, knowledgeBaseBindings: [], model: 'test-model', systemPrompt: '' }], 'agent', [], null, {}, null, null, false, '', [attachment], false, '', false, '', false];
});

it.each(['SERVICE_NOT_READY', 'ATTACHMENT_INVALID'])('restores attachments and rejects drafts on HTTP %s', async code => {
  harness.stream.mockRejectedValue(new ApiError(code === 'SERVICE_NOT_READY' ? 503 : 400, code, '请求未接受'));
  const view = AgentChatPage();
  expect(await view.props.handleSend('我的问题')).toBe(false);
  expect(harness.setters[11]).toHaveBeenLastCalledWith([attachment]);
});

it.each(['SERVICE_NOT_READY', 'CONTEXT_COMPRESSION_FAILED'])('restores attachments before run.started on SSE %s', async code => {
  harness.stream.mockImplementation(async (_id, _content, handlers) => {
    handlers.onFailed(code, '请求未接受', true);
  });
  const view = AgentChatPage();
  expect(await view.props.handleSend('我的问题')).toBe(false);
  expect(harness.setters[11]).toHaveBeenLastCalledWith([attachment]);
  if (code === 'SERVICE_NOT_READY') expect(harness.refresh).toHaveBeenCalledOnce();
  else expect(harness.refresh).not.toHaveBeenCalled();
});

it('does not restore bound attachments after run.started', async () => {
  harness.stream.mockImplementation(async (_id, _content, handlers) => {
    handlers.onStarted('assistant-message');
    handlers.onFailed('MODEL_ERROR', '生成失败', true);
  });
  const view = AgentChatPage();
  expect(await view.props.handleSend('我的问题')).toBe(true);
  expect(harness.setters[11]).toHaveBeenCalledExactlyOnceWith([]);
});

it.each(['PARSING', 'FAILED'])('does not accept drafts with %s attachments', async status => {
  harness.values[11] = [{ ...attachment, status }];
  const view = AgentChatPage();
  expect(await view.props.handleSend('我的问题')).toBe(false);
  expect(harness.stream).not.toHaveBeenCalled();
});
