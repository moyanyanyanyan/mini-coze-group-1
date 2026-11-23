import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamMessage } from './chat-api';

const frame = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, data })}\n\n`;

function streamResponse(payload: string) {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('streamMessage', () => {
  it('signals connection, streams deltas, and delivers the final answer', async () => {
    const payload = frame('run.started', { assistantMessageId: 'assistant-1' })
      + frame('message.delta', { content: '你好' })
      + frame('run.completed', { content: '你好！' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(payload)));
    const events: string[] = [];

    await streamMessage('conversation-1', '问题', {
      onConnected: () => events.push('connected'),
      onStarted: (id) => events.push(id),
      onDelta: (text) => events.push(text),
      onCompleted: (text) => events.push(text),
    });

    expect(events).toEqual(['connected', 'assistant-1', '你好', '你好！']);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conversation-1/messages/stream'),
      expect.objectContaining({ body: JSON.stringify({ content: '问题' }), credentials: 'include' }),
    );
  });

  it('does not deliver buffered frames after stopping', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(frame('message.delta', { content: 'late' }))));
    const onDelta = vi.fn();

    await expect(streamMessage('conversation-1', '问题', {
      onConnected: () => controller.abort(),
      onDelta,
    }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(onDelta).not.toHaveBeenCalled();
  });
});
