import { afterEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ effect: undefined as undefined | (() => () => void), setStatus: vi.fn(), setRevision: vi.fn(), index: 0 }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => () => void) => { hooks.effect = fn; },
  useState: (initial: unknown) => [initial, hooks.index++ % 2 === 0 ? hooks.setStatus : hooks.setRevision],
}));
vi.mock('../../shared/api/http', () => ({ get: vi.fn() }));
import { get } from '../../shared/api/http';
import { useChatReadiness } from './use-chat-readiness';
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); hooks.index = 0; });

it('polls serially, slows down when ready, and cancels on unmount', async () => {
  vi.useFakeTimers();
  let resolve!: (value: { status: string }) => void;
  vi.mocked(get).mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValueOnce({ status: 'ready' });
  expect(useChatReadiness().status).toBe('starting');
  const cleanup = hooks.effect!();
  await vi.advanceTimersByTimeAsync(2000);
  expect(get).toHaveBeenCalledTimes(1);
  resolve({ status: 'starting' });
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2000);
  expect(get).toHaveBeenCalledTimes(2);
  expect(hooks.setStatus).toHaveBeenLastCalledWith('ready');
  await vi.advanceTimersByTimeAsync(9999);
  expect(get).toHaveBeenCalledTimes(2);
  cleanup();
  expect(vi.mocked(get).mock.calls[1][1]?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(get).toHaveBeenCalledTimes(2);
});

it('reports probe failure and resets status on manual refresh', async () => {
  vi.useFakeTimers();
  vi.mocked(get).mockRejectedValueOnce(new Error('offline'));
  const hook = useChatReadiness();
  const cleanup = hooks.effect!();
  await vi.advanceTimersByTimeAsync(0);
  expect(hooks.setStatus).toHaveBeenCalledWith('unavailable');
  cleanup();
  hook.refresh();
  expect(hooks.setStatus).toHaveBeenLastCalledWith('starting');
  expect(hooks.setRevision).toHaveBeenCalled();
});


it('ignores a late response after cleanup without scheduling another poll', async () => {
  vi.useFakeTimers();
  let resolve!: (value: { status: string }) => void;
  vi.mocked(get).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  useChatReadiness();
  const cleanup = hooks.effect!();
  cleanup();
  resolve({ status: 'ready' });
  await vi.advanceTimersByTimeAsync(20000);
  expect(hooks.setStatus).not.toHaveBeenCalled();
  expect(get).toHaveBeenCalledTimes(1);
});
