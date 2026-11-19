import { parseRuntimeStages } from '@minicoze/shared';
import { Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { Prisma } from '@prisma/client';
import { RuntimeClientService, RuntimeCallError, isRuntimeResult, type RuntimeRequestBody, type RuntimeResult, type RuntimeSseEvent } from '../../../chat/runtime-client.service';
import { OperationRecordsService, type CollectedResult } from './operation-records.service';

const MAX_BYTES = 128 * 1024;
const MAX_EVENTS = 100;
const secretKey = /token|authorization|cookie|password|secret|api.?key|credential/i;

export function sanitizeObservation(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (depth > 5) return '[DEPTH_LIMIT]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    let text = value.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g, '[REDACTED]');
    for (const secret of [process.env.INTERNAL_SERVICE_TOKEN, process.env.JWT_SECRET]) if (secret) text = text.replaceAll(secret, '[REDACTED]');
    return text.length > 2000 ? text.slice(0, 2000) + '…[TRUNCATED]' : text;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return [...value.slice(0, 30).map(item => sanitizeObservation(item, depth + 1)), ...(value.length > 30 ? ['[TRUNCATED]'] : [])];
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return Object.fromEntries([...entries.slice(0, 30).map(([key, item]) => [key, secretKey.test(key) && !(/^(prompt|completion|total)Tokens$/.test(key) && typeof item === 'number' && Number.isSafeInteger(item) && item >= 0) ? '[REDACTED]' : sanitizeObservation(item, depth + 1)]), ...(entries.length > 30 ? [['__truncated', '[TRUNCATED]']] : [])]);
  }
  return null;
}

class Observation {
  readonly started = performance.now();
  readonly result: CollectedResult = { status: 'running', durationMs: 0, firstTokenMs: null, inputTokens: null, outputTokens: null, totalTokens: null, errorCode: null, events: [], truncated: false };
  private bytes = 0;
  private lastSeq = 0;
  private invalid = false;
  private tools = new Map<string, number>();
  constructor(private readonly request: RuntimeRequestBody) {}
  elapsed() { return Math.max(0, Math.round(performance.now() - this.started)); }

  add(type: string, value: unknown) {
    const data = sanitizeObservation(value);
    const event = { type, observedAt: new Date().toISOString(), data };
    const encoded = JSON.stringify(event);
    const size = Buffer.byteLength(encoded);
    if (this.result.events.length >= MAX_EVENTS || size > 16 * 1024 || this.bytes + size > MAX_BYTES) { this.result.truncated = true; return; }
    if (encoded.includes('[TRUNCATED]') || encoded.includes('[DEPTH_LIMIT]')) this.result.truncated = true;
    this.result.events.push(event);
    this.bytes += size;
  }

  stages(value: unknown) {
    const stages = parseRuntimeStages(value);
    if (Array.isArray(value) && stages.length !== value.length) this.result.truncated = true;
    for (const stage of stages) this.add('runtime.stage', stage);
  }

  complete(value: RuntimeResult) {
    if (value.runId !== this.request.runId || value.conversationId !== this.request.conversationId || value.assistantMessageId !== this.request.assistantMessageId) { this.invalid = true; return; }
    this.result.status = 'completed';
    this.stages(value.stages);
    const usage = value.usage;
    if (usage && [usage.promptTokens, usage.completionTokens, usage.totalTokens].every(n => Number.isInteger(n) && n >= 0 && n <= 2_147_483_647) && usage.totalTokens === usage.promptTokens + usage.completionTokens) {
      this.result.inputTokens = usage.promptTokens; this.result.outputTokens = usage.completionTokens; this.result.totalTokens = usage.totalTokens;
    }
    this.add('runtime.result', { finishReason: value.finishReason, citations: value.citations, toolResults: value.toolResults });
  }

  event(event: RuntimeSseEvent) {
    if (event.runId !== this.request.runId || event.conversationId !== this.request.conversationId || event.seq !== this.lastSeq + 1) { this.invalid = true; return; }
    if ((this.lastSeq === 0 && event.type !== 'run.started') || (event.type === 'run.started' && (this.lastSeq > 0 || event.data.assistantMessageId !== this.request.assistantMessageId))) this.invalid = true;
    this.lastSeq = event.seq;
    if (event.type === 'message.delta') {
      if (typeof event.data.content === 'string' && event.data.content.length && this.result.firstTokenMs === null) this.result.firstTokenMs = this.elapsed();
    } else if (event.type === 'run.completed') {
      if (isRuntimeResult(event.data)) this.complete(event.data); else this.invalid = true;
    } else if (event.type === 'run.failed') {
      this.stages(event.data.stages);
      this.result.status = 'failed';
      this.result.errorCode = this.errorCode(event.data.code);
      this.add(event.type, { code: this.result.errorCode, retryable: event.data.retryable });
    } else if (event.type === 'tool.started') {
      if (typeof event.data.toolCallId === 'string' && this.tools.size < MAX_EVENTS) this.tools.set(event.data.toolCallId, this.elapsed());
      this.add(event.type, { toolCallId: event.data.toolCallId, toolName: event.data.toolName });
    } else if (event.type === 'tool.completed') {
      const started = this.tools.get(String(event.data.toolCallId));
      this.add(event.type, { toolCallId: event.data.toolCallId, toolName: event.data.toolName, status: event.data.status, output: event.data.output, error: event.data.error, durationMs: started === undefined ? null : this.elapsed() - started });
    } else if (event.type === 'knowledge.result') {
      this.add(event.type, { status: event.data.status, citations: event.data.citations });
    }
  }
  private errorCode(value: unknown) { return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(value) ? value : 'RUNTIME_ERROR'; }
  failure(error: unknown, signal?: AbortSignal) {
    if (error instanceof RuntimeCallError) this.stages(error.options.stages);
    const cancelled = signal?.aborted || (error instanceof RuntimeCallError && error.options.kind === 'aborted');
    this.result.status = cancelled ? 'cancelled' : 'failed';
    this.result.errorCode = cancelled ? 'REQUEST_ABORTED' : error instanceof RuntimeCallError ? this.errorCode(error.code) : 'RUNTIME_ERROR';
  }
  finish(exhausted: boolean, signal?: AbortSignal) {
    if (this.invalid) { this.result.status = 'failed'; this.result.errorCode = 'RUNTIME_PROTOCOL_ERROR'; }
    else if (this.result.status === 'running') {
      this.result.status = signal?.aborted || !exhausted ? 'cancelled' : 'interrupted';
      this.result.errorCode = this.result.status === 'cancelled' ? 'REQUEST_ABORTED' : 'STREAM_INTERRUPTED';
    }
    this.result.durationMs = this.elapsed();
    return this.result;
  }
}

@Injectable()
export class RuntimeCollectorService extends RuntimeClientService {
  constructor(private readonly records: OperationRecordsService) { super(); }

  override async run(request: RuntimeRequestBody, signal?: AbortSignal): Promise<RuntimeResult> {
    const saved = await this.records.start(request, 'run');
    const observation = new Observation(request);
    try {
      const result = await super.run(request, signal);
      observation.complete(result);
      return result;
    } catch (error) { observation.failure(error, signal); throw error; }
    finally { if (saved) await this.records.finish(request.runId, observation.finish(true, signal)); }
  }

  override async *stream(request: RuntimeRequestBody, signal?: AbortSignal): AsyncGenerator<RuntimeSseEvent> {
    const saved = await this.records.start(request, 'stream');
    const observation = new Observation(request);
    let exhausted = false;
    try {
      for await (const event of super.stream(request, signal)) {
        observation.event(event);
        // 不等待每个事件写库，也不修改聊天消费的原始事件。
        yield event;
      }
      exhausted = true;
    } catch (error) { observation.failure(error, signal); throw error; }
    finally { if (saved) await this.records.finish(request.runId, observation.finish(exhausted, signal)); }
  }
}
