import { Children, type ReactElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ draft: '我的草稿', setDraft: vi.fn() }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.draft, state.setDraft],
  useRef: (value: unknown) => ({ current: value }),
  useLayoutEffect: () => undefined,
}));
import { MessageComposer } from './MessageComposer';
import styles from './agent-chat.module.css';
// 直接驱动元素事件，验证发送约束而不依赖浏览器布局。
function render(onSend: () => Promise<boolean>, sendBlocked = false, extra: Partial<Parameters<typeof MessageComposer>[0]> = {}) {
  const form = MessageComposer({ disabled: false, onSend, sendBlocked, ...extra });
  const children = Children.toArray(form.props.children) as ReactElement<Record<string, unknown>>[];
  const row = children.find(child => child.props.className === styles.composerControls)!;
  const controls = Children.toArray(row.props.children as ReactNode) as ReactElement<Record<string, unknown>>[];
  const textarea = controls.find(child => child.type === 'textarea')!;
  const button = controls.find(child => child.props['aria-label'] === '发送')!;
  return { form, textarea, button };
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

it.each(['PARSING', 'FAILED'] as const)('blocks every send path for %s attachments', status => {
  const onSend = vi.fn(async () => true);
  const { form, textarea, button } = render(onSend, false, {
    attachments: [{ id: 'attachment', fileName: '说明.md', sourceType: 'MD', byteSize: 10, status }],
  });
  expect(button.props.disabled).toBe(true);
  form.props.onSubmit({ preventDefault: vi.fn() });
  (textarea.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', nativeEvent: {}, preventDefault: vi.fn() });
  expect(onSend).not.toHaveBeenCalled();
  expect(state.setDraft).not.toHaveBeenCalled();
});

it('blocks uploading and accepts ready attachments', async () => {
  const onSend = vi.fn(async () => true);
  const uploading = render(onSend, false, { uploading: true });
  uploading.form.props.onSubmit({ preventDefault: vi.fn() });
  expect(onSend).not.toHaveBeenCalled();
  const ready = render(onSend, false, {
    attachments: [{ id: 'attachment', fileName: '说明.md', sourceType: 'MD', byteSize: 10, status: 'READY' }],
  });
  expect(ready.button.props.disabled).toBe(false);
  ready.form.props.onSubmit({ preventDefault: vi.fn() });
  await Promise.resolve();
  expect(onSend).toHaveBeenCalledOnce();
});
