import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useLayoutEffect: () => undefined,
}));
vi.mock('../auth/api/auth-api', () => ({ getMe: vi.fn() }));
vi.mock('./operations.api', () => ({ loadOperations: vi.fn() }));
vi.mock('@minicoze/ui/hooks', () => ({ useConfirm: () => ({ confirm: vi.fn(), confirmation: null }) }));
vi.mock('../../shared/routing/navigation', () => ({
  navigate: vi.fn(), useRouteLocation: () => '/workspace/operations',
}));

import { getMe } from '../auth/api/auth-api';
import { loadOperations } from './operations.api';
import { OperationsPage } from './OperationsPage';

let documentTarget: EventTarget & { hidden: boolean };
let windowTarget: EventTarget;
let cleanup: (() => void) | void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  harness.effects = [];
  documentTarget = Object.assign(new EventTarget(), { hidden: false });
  windowTarget = new EventTarget();
  vi.stubGlobal('document', documentTarget);
  vi.stubGlobal('window', windowTarget);
  vi.mocked(getMe).mockResolvedValue({ id: 'owner' } as Awaited<ReturnType<typeof getMe>>);
  vi.mocked(loadOperations).mockResolvedValue({ runs: [], tasks: [], agents: [], bases: [], documents: [], conversations: [], snapshotAt: Date.now() });
});

afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  const page = OperationsPage();
  const Controller = page.type as (props: typeof page.props) => unknown;
  Controller(page.props);
  cleanup = harness.effects[0]();
  await vi.advanceTimersByTimeAsync(0);
}

it('没有运行中任务时仍刷新，取回新完成的聊天记录', async () => {
  await mount();
  expect(loadOperations).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(loadOperations).toHaveBeenCalledTimes(2);
});

it.each(['visibilitychange', 'focus'])('返回页面时通过 %s 立即刷新，并清理监听器', async event => {
  await mount();
  const target = event === 'focus' ? windowTarget : documentTarget;
  target.dispatchEvent(new Event(event));
  await vi.advanceTimersByTimeAsync(0);
  expect(loadOperations).toHaveBeenCalledTimes(2);
  cleanup?.();
  cleanup = undefined;
  target.dispatchEvent(new Event(event));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(loadOperations).toHaveBeenCalledTimes(2);
});

it('页面隐藏期间停止刷新，恢复可见后重新读取数据', async () => {
  await mount();
  documentTarget.hidden = true;
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(loadOperations).toHaveBeenCalledTimes(1);
  documentTarget.hidden = false;
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(loadOperations).toHaveBeenCalledTimes(2);
});
