import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { ComposerAttachment } from './types';
import { MessageComposer } from './MessageComposer';

const attachment = (overrides: Partial<ComposerAttachment>): ComposerAttachment => ({
  id: 'a1',
  fileName: '需求说明.md',
  sourceType: 'FILE',
  byteSize: 2048,
  status: 'READY',
  ...overrides,
});

const render = (attachments: ComposerAttachment[]) => renderToStaticMarkup(
  <MessageComposer disabled={false} onSend={() => {}} attachments={attachments} />,
);

it('解析中的附件显示解析中，发送按钮保持禁用', () => {
  const markup = render([attachment({ status: 'PARSING' })]);

  expect(markup).toContain('需求说明.md');
  expect(markup).toContain('解析中');
  // 静态渲染拿不到输入内容，这里只能守住「非 READY 附件不放开发送」的标记
  expect(markup).toMatch(/type="submit"[^>]*disabled[^>]*aria-label="发送"/);
});

it('READY 附件显示文件名和格式化后的大小', () => {
  const markup = render([attachment({ status: 'READY' })]);

  expect(markup).toContain('需求说明.md');
  expect(markup).toContain('2.0 KB');
  expect(markup).not.toContain('解析中');
  expect(markup).not.toContain('解析失败');
  expect(markup).toMatch(/type="submit"[^>]*aria-label="发送"/);
  expect(markup).not.toMatch(/type="submit"[^>]*disabled[^>]*aria-label="发送"/);
});

it('FAILED 附件显示解析失败', () => {
  const markup = render([attachment({ status: 'FAILED', errorCode: 'UNSUPPORTED_FILE' })]);

  expect(markup).toContain('需求说明.md');
  expect(markup).toContain('解析失败');
  expect(markup).toMatch(/type="submit"[^>]*disabled[^>]*aria-label="发送"/);
});

it('上传期间提示正在解析并禁用发送', () => {
  const markup = renderToStaticMarkup(<MessageComposer disabled={false} onSend={() => {}} uploading attachments={[attachment({ status: 'READY' })]} />);

  expect(markup).toContain('附件上传并解析中');
  expect(markup).toMatch(/type="submit"[^>]*disabled[^>]*aria-label="发送"/);
});

it('附件解析失败时展示服务端原因', () => {
  const markup = render([attachment({ status: 'FAILED', errorMessage: '文件格式无效' })]);
  expect(markup).toContain('文件格式无效');
});
