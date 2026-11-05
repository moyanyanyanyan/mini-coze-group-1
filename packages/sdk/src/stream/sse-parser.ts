import {
  MiniCozeAbortError,
  MiniCozeSDKError,
  MiniCozeStreamError,
} from '../http/errors.js';

export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

export interface ParseSSEStreamOptions {
  signal?: AbortSignal;
}

export class SSEParser {
  #buffer = '';
  #eventType = '';
  #dataLines: string[] = [];
  #lastEventId = '';

  push(chunk: string): SSEEvent[] {
    if (!chunk) {
      return [];
    }

    const events: SSEEvent[] = [];
    this.#buffer += chunk;
    let cursor = 0;

    while (cursor < this.#buffer.length) {
      let lineEnd = -1;
      let lineBreakLength = 1;

      for (let index = cursor; index < this.#buffer.length; index += 1) {
        const character = this.#buffer[index];

        if (character === '\n') {
          lineEnd = index;
          break;
        }

        if (character === '\r') {
          if (index === this.#buffer.length - 1) {
            break;
          }

          lineEnd = index;
          lineBreakLength = this.#buffer[index + 1] === '\n' ? 2 : 1;
          break;
        }
      }

      if (lineEnd === -1) {
        break;
      }

      this.#processLine(this.#buffer.slice(cursor, lineEnd), events);
      cursor = lineEnd + lineBreakLength;
    }

    this.#buffer = this.#buffer.slice(cursor);
    return events;
  }

  finish(): SSEEvent[] {
    const events: SSEEvent[] = [];

    // A trailing CR at EOF terminates an empty line, but an unterminated data line is incomplete.
    if (this.#buffer === '\r') {
      this.#processLine('', events);
    }

    this.#buffer = '';
    this.#eventType = '';
    this.#dataLines = [];
    this.#lastEventId = '';
    return events;
  }

  #processLine(line: string, events: SSEEvent[]) {
    if (!line) {
      if (this.#dataLines.length > 0) {
        events.push({
          event: this.#eventType || 'message',
          data: this.#dataLines.join('\n'),
          id: this.#lastEventId || undefined,
        });
      }

      this.#eventType = '';
      this.#dataLines = [];
      return;
    }

    if (line.startsWith(':')) {
      return;
    }

    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);

    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    if (field === 'event') {
      this.#eventType = value;
    } else if (field === 'data') {
      this.#dataLines.push(value);
    } else if (field === 'id' && !value.includes('\0')) {
      this.#lastEventId = value;
    }
  }
}

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseSSEStreamOptions = {},
): AsyncGenerator<SSEEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  const parser = new SSEParser();
  let completed = false;

  const createAbortError = () => new MiniCozeAbortError('Stream reading was aborted', {
    cause: options.signal?.reason,
  });
  const cancelReader = () => {
    void reader.cancel(options.signal?.reason).catch(() => undefined);
  };

  if (options.signal?.aborted) {
    await reader.cancel(options.signal.reason).catch(() => undefined);
    reader.releaseLock();
    throw createAbortError();
  }

  options.signal?.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      if (options.signal?.aborted) {
        throw createAbortError();
      }

      const { done, value } = await reader.read();

      if (options.signal?.aborted) {
        throw createAbortError();
      }

      if (done) {
        completed = true;
        break;
      }

      const text = decoder.decode(value, { stream: true });

      for (const event of parser.push(text)) {
        yield event;
      }
    }

    const tail = decoder.decode();

    if (tail) {
      for (const event of parser.push(tail)) {
        yield event;
      }
    }

    for (const event of parser.finish()) {
      yield event;
    }
  } catch (error) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    if (error instanceof MiniCozeSDKError) {
      throw error;
    }

    throw new MiniCozeStreamError('Stream reading failed', { cause: error });
  } finally {
    options.signal?.removeEventListener('abort', cancelReader);

    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }

    reader.releaseLock();
  }
}
