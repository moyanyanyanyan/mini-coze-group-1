import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamMessage } from './chat-api';

afterEach(() => vi.unstubAllGlobals());

describe('chat stream transport', () => {
  it('decodes split UTF-8 frames, citations and final content, then releases the reader', async () => {
    const frame = (type: string, data: object) => `data: ${JSON.stringify({ type, data })}\n\n`;
    const encoded = new TextEncoder().encode(': heartbeat\n\n' + frame('run.started', { assistantMessageId: 'reply-1' })
      + frame('message.delta', { content: '你好' })
      + frame('knowledge.result', { status: 'HIT', citations: [{ title: '文档' }] })
      + frame('run.completed', { content: '完整回答' }).trimEnd());
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } });
    const fetchMock = vi.fn(async () => new Response(body));
    vi.stubGlobal('fetch', fetchMock);
    const handlers = { onStarted: vi.fn(), onDelta: vi.fn(), onKnowledge: vi.fn(), onCompleted: vi.fn() };
    const controller = new AbortController();
    await streamMessage('conversation-1', '问题', handlers, controller.signal);
    expect(handlers.onStarted).toHaveBeenCalledWith('reply-1');
    expect(handlers.onDelta).toHaveBeenCalledWith('你好');
    expect(handlers.onKnowledge).toHaveBeenCalledWith('HIT', [{ title: '文档' }]);
    expect(handlers.onCompleted).toHaveBeenCalledWith('完整回答');
    expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conversation-1/messages/stream',
      expect.objectContaining({ method: 'POST', credentials: 'include', signal: controller.signal,
        body: JSON.stringify({ content: '问题' }) }));
    expect(body.locked).toBe(false);
  });

  it('propagates cancellation and releases the reader without completing the message', async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ start(stream) {
      controller.signal.addEventListener('abort', () => stream.error(new DOMException('Stopped', 'AbortError')));
    } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
    const onCompleted = vi.fn();
    const pending = streamMessage('conversation-1', '问题', { onDelta: vi.fn(), onCompleted }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(onCompleted).not.toHaveBeenCalled();
    expect(body.locked).toBe(false);
  });

  it('keeps stream failures distinct from HTTP authentication errors', async () => {
    const onFailed = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {"type":"run.failed","data":{"code":"MODEL_ERROR","message":"生成失败","retryable":true}}\n\n')));
    await streamMessage('conversation-1', '问题', { onDelta: vi.fn(), onFailed });
    expect(onFailed).toHaveBeenCalledWith('MODEL_ERROR', '生成失败', true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: '请登录' }), { status: 401 })));
    await expect(streamMessage('conversation-1', '问题', { onDelta: vi.fn() })).rejects.toMatchObject({ status: 401, message: '请登录' });
  });
});
