import { afterEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ effect: undefined as undefined | (() => void | (() => void)), setters: [vi.fn(), vi.fn(), vi.fn()], index: 0 }));
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, harness.setters[harness.index++]],
  useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; },
}));
vi.mock('./api/chat-api', () => ({ getConversationMemory: vi.fn() }));
import { getConversationMemory } from './api/chat-api';
import { useConversationMemory } from './use-conversation-memory';

afterEach(() => { vi.resetAllMocks(); harness.index = 0; });

it('切换会话后丢弃旧请求结果，不把上一段对话记忆显示给新会话', async () => {
  let resolve!: (value: never) => void;
  vi.mocked(getConversationMemory).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  useConversationMemory('old-conversation', false);
  const cleanup = harness.effect!();
  expect(getConversationMemory).toHaveBeenCalledWith('old-conversation');
  cleanup?.();
  resolve({ conversationId: 'old-conversation', history: [] } as never);
  await new Promise(done => setTimeout(done, 0));
  expect(harness.setters[0]).not.toHaveBeenCalled();
});

it('生成中不读取半轮记忆，失败明确显示并支持重新刷新', async () => {
  useConversationMemory('conversation', true);
  harness.effect!();
  expect(getConversationMemory).not.toHaveBeenCalled();
  harness.index = 0;
  vi.mocked(getConversationMemory).mockRejectedValueOnce(new Error('预算服务离线'));
  const state = useConversationMemory('conversation', false);
  const cleanup = harness.effect!();
  await new Promise(done => setTimeout(done, 0));
  expect(harness.setters[0]).toHaveBeenCalledWith({ id: 'conversation', error: '预算服务离线' });
  state.refresh();
  expect(harness.setters[2]).toHaveBeenCalled();
  cleanup?.();
});
