import type { ReactElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ draft: '我的草稿', setDraft: vi.fn() }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.draft, state.setDraft],
  useRef: (value: unknown) => ({ current: value }),
  useLayoutEffect: () => undefined,
}));
import { MessageComposer } from './MessageComposer';
// 直接驱动元素事件，验证发送约束而不依赖浏览器布局。
function render(onSend: () => Promise<boolean>, sendBlocked = false) {
  const form = MessageComposer({ disabled: false, onSend, sendBlocked });
  const children = form.props.children as ReactElement<Record<string, unknown>>[];
  return { form, textarea: children[0], button: children[1] };
}
afterEach(() => vi.clearAllMocks());
it('allows drafting while blocking button, Enter and form submission', () => {
  const onSend = vi.fn(async () => true);
  const { form, textarea, button } = render(onSend, true);
  expect(textarea.props.disabled).toBe(false);
  expect(button.props.disabled).toBe(true);
  form.props.onSubmit({ preventDefault: vi.fn() });
  (textarea.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault: vi.fn() });
  expect(onSend).not.toHaveBeenCalled();
  expect(state.setDraft).not.toHaveBeenCalled();
});
it.each([false, true])('preserves rejected drafts and clears accepted drafts: %s', async accepted => {
  const onSend = vi.fn(async () => accepted);
  const { form } = render(onSend);
  form.props.onSubmit({ preventDefault: vi.fn() });
  await Promise.resolve();
  expect(onSend).toHaveBeenCalledWith('我的草稿');
  if (accepted) {
    expect(state.setDraft.mock.calls[0][0]('我的草稿')).toBe('');
    expect(state.setDraft.mock.calls[0][0]('新的草稿')).toBe('新的草稿');
  } else expect(state.setDraft).not.toHaveBeenCalled();
});


it('prevents duplicate submissions while awaiting acceptance', async () => {
  let resolve!: (value: boolean) => void;
  const onSend = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
  const { form } = render(onSend);
  form.props.onSubmit({ preventDefault: vi.fn() });
  form.props.onSubmit({ preventDefault: vi.fn() });
  expect(onSend).toHaveBeenCalledTimes(1);
  resolve(false);
  await Promise.resolve();
  expect(state.setDraft).not.toHaveBeenCalled();
});
