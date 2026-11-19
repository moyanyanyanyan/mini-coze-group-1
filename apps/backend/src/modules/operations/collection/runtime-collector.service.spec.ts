import { Logger } from '@nestjs/common';
import { RuntimeClientService, RuntimeCallError, type RuntimeRequestBody, type RuntimeResult, type RuntimeSseEvent } from '../../../chat/runtime-client.service';
import { RuntimeCollectorService, sanitizeObservation } from './runtime-collector.service';
import { OperationRecordsService } from './operation-records.service';

const request: RuntimeRequestBody = {
  runId: 'run', actor: { id: 'user' }, conversationId: 'conversation', userMessageId: 'question', assistantMessageId: 'answer',
  agentConfig: { id: 'agent', name: 'test', revision: 1, systemPrompt: '不要存储提示词', model: 'test', temperature: 0.7, maxTokens: 50, knowledgeBaseIds: [], pluginIds: [] }, history: [], message: '不要复制正文',
};
const result: RuntimeResult = { runId: 'run', conversationId: 'conversation', assistantMessageId: 'answer', status: 'completed', content: '回答', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 }, citations: [], toolResults: [] };
function event(type: RuntimeSseEvent['type'], seq: number, data: Record<string, unknown>): RuntimeSseEvent { return { runId: 'run', conversationId: 'conversation', type, seq, timestamp: new Date().toISOString(), data }; }
function setup() {
  const records = { start: jest.fn().mockResolvedValue(true), finish: jest.fn().mockResolvedValue(undefined) };
  return { records, service: new RuntimeCollectorService(records as never) };
}
afterEach(() => jest.restoreAllMocks());

describe('operations 内部 Runtime 采集', () => {
  const stage = { stageId: 'stage-1', kind: 'model', startedAt: '2026-11-14T00:00:00Z', durationMs: 120, status: 'completed', round: 1, model: 'model', usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 } };

  it('只保存校验后的阶段字段，保留逐轮 usage 且不重复累计总用量', async () => {
    jest.spyOn(RuntimeClientService.prototype, 'run').mockResolvedValue({ ...result, stages: [{ ...stage, prompt: '不可保存的提示词' }, { ...stage, stageId: 'bad', durationMs: -1 }] });
    const { service, records } = setup();
    await service.run(request);
    const saved = records.finish.mock.calls[0][1];
    expect(saved.totalTokens).toBe(12);
    expect(saved.events.filter((e: { type: string }) => e.type === 'runtime.stage')).toEqual([{ type: 'runtime.stage', observedAt: expect.any(String), data: stage }]);
    expect(saved.truncated).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('不可保存');
  });

  it('非流式失败保留阶段摘要并原样抛出错误', async () => {
    const failure = new RuntimeCallError('MODEL_TIMEOUT', '超时', { kind: 'runtime', stages: [{ ...stage, status: 'failed' }] });
    jest.spyOn(RuntimeClientService.prototype, 'run').mockRejectedValue(failure);
    const { service, records } = setup();
    await expect(service.run(request)).rejects.toBe(failure);
    expect(records.finish.mock.calls[0][1].events[0]).toMatchObject({ type: 'runtime.stage', data: { status: 'failed' } });
  });

  it('流式失败终态保存已完成及失败阶段，不伪造后续步骤', async () => {
    jest.spyOn(RuntimeClientService.prototype, 'stream').mockImplementation(async function* () {
      yield event('run.started', 1, { assistantMessageId: 'answer' });
      yield event('run.failed', 2, { code: 'MODEL_TIMEOUT', stages: [{ ...stage, status: 'interrupted' }] });
    });
    const { service, records } = setup();
    for await (const item of service.stream(request)) { if (item.type === 'run.failed') break; }
    expect(records.finish.mock.calls[0][1]).toMatchObject({ status: 'failed', inputTokens: null });
    expect(records.finish.mock.calls[0][1].events[0]).toMatchObject({ type: 'runtime.stage', data: { status: 'interrupted' } });
  });

  it('非流式原样返回结果，记录实际 usage，不保存正文和提示词', async () => {
    jest.spyOn(RuntimeClientService.prototype, 'run').mockResolvedValue(result);
    const { service, records } = setup();
    expect(await service.run(request)).toBe(result);
    expect(records.finish).toHaveBeenCalledWith('run', expect.objectContaining({ status: 'completed', inputTokens: 10, outputTokens: 2, totalTokens: 12, firstTokenMs: null }));
    expect(JSON.stringify(records.finish.mock.calls)).not.toContain('不要');
    expect(JSON.stringify(records.finish.mock.calls)).not.toContain('回答');
  });

  it('流式逐个原样转发，ChatService 在终态 break 仍保存完成结果', async () => {
    let closed = false;
    const events = [event('run.started', 1, { assistantMessageId: 'answer' }), event('message.delta', 2, { content: '回答' }), event('tool.started', 3, { toolCallId: 't', toolName: 'echo' }), event('tool.completed', 4, { toolCallId: 't', toolName: 'echo', status: 'succeeded', output: { password: 'private', text: 'normal' } }), event('run.completed', 5, result as unknown as Record<string, unknown>)];
    jest.spyOn(RuntimeClientService.prototype, 'stream').mockImplementation(async function* () { try { yield* events; } finally { closed = true; } });
    const { service, records } = setup();
    const received = [];
    for await (const value of service.stream(request)) { received.push(value); if (value.type === 'run.completed') break; }
    expect(received).toEqual(events); expect(received[0]).toBe(events[0]); expect(closed).toBe(true);
    const saved = records.finish.mock.calls[0][1];
    expect(saved.status).toBe('completed'); expect(saved.firstTokenMs).toBeGreaterThanOrEqual(0);
    expect(saved.events.find((e: { type: string }) => e.type === 'tool.completed').data.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(saved)).not.toContain('private');
    expect(JSON.stringify(saved)).toContain('[REDACTED]');
    expect(saved.events.some((e: { type: string }) => e.type === 'message.delta')).toBe(false);
  });

  it('取消会关闭上游迭代器，未知 usage 保持 null', async () => {
    let closed = false;
    jest.spyOn(RuntimeClientService.prototype, 'stream').mockImplementation(async function* () { try { yield event('run.started', 1, { assistantMessageId: 'answer' }); yield event('message.delta', 2, { content: 'x' }); } finally { closed = true; } });
    const { service, records } = setup();
    for await (const _value of service.stream(request)) break;
    expect(closed).toBe(true);
    expect(records.finish).toHaveBeenCalledWith('run', expect.objectContaining({ status: 'cancelled', inputTokens: null, totalTokens: null }));
  });

  it('网络错误原样抛出；缺少终态标记中断', async () => {
    const failure = new RuntimeCallError('RUNTIME_UNAVAILABLE', 'unavailable', { kind: 'network' });
    jest.spyOn(RuntimeClientService.prototype, 'run').mockRejectedValue(failure);
    const { service, records } = setup();
    await expect(service.run(request)).rejects.toBe(failure);
    expect(records.finish).toHaveBeenLastCalledWith('run', expect.objectContaining({ status: 'failed', errorCode: 'RUNTIME_UNAVAILABLE' }));
    jest.spyOn(RuntimeClientService.prototype, 'stream').mockImplementation(async function* () { yield event('run.started', 1, { assistantMessageId: 'answer' }); });
    for await (const _value of service.stream(request)) { /* 消费到流结束以验证缺失终态。 */ }
    expect(records.finish).toHaveBeenLastCalledWith('run', expect.objectContaining({ status: 'interrupted', totalTokens: null }));
  });

  it('标识错误不污染另一轮记录，仍把原始事件交给聊天模块校验', async () => {
    const invalid = { ...result, runId: 'other' };
    jest.spyOn(RuntimeClientService.prototype, 'run').mockResolvedValue(invalid);
    const { service, records } = setup();
    expect(await service.run(request)).toBe(invalid);
    expect(records.finish).toHaveBeenCalledWith('run', expect.objectContaining({ status: 'failed', errorCode: 'RUNTIME_PROTOCOL_ERROR', totalTokens: null }));
  });

  it('事件上限有截断标记，不无限保存', async () => {
    jest.spyOn(RuntimeClientService.prototype, 'stream').mockImplementation(async function* () {
      yield event('run.started', 1, { assistantMessageId: 'answer' });
      for (let seq = 2; seq < 120; seq++) yield event('knowledge.result', seq, { status: 'no_match', citations: [] });
      yield event('run.completed', 120, result as unknown as Record<string, unknown>);
    });
    const { service, records } = setup();
    for await (const _value of service.stream(request)) { /* 完整消费并检查记录大小上限。 */ }
    expect(records.finish.mock.calls[0][1]).toMatchObject({ truncated: true, status: 'completed' });
    expect(records.finish.mock.calls[0][1].events).toHaveLength(100);
  });

  it('数据库采集失败不改变原始响应，并记录明确错误', async () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const prisma = { conversation: { findFirst: jest.fn().mockRejectedValue(new Error('database down')) }, operationRuntimeRun: { updateMany: jest.fn().mockRejectedValue(new Error('down')) } };
    const records = new OperationRecordsService(prisma as never);
    jest.spyOn(RuntimeClientService.prototype, 'run').mockResolvedValue(result);
    expect(await new RuntimeCollectorService(records).run(request)).toBe(result);
    await records.finish('run', {} as never);
    expect(logger).toHaveBeenCalledTimes(2);
  });

  it('递归脱敏且标注集合截断', () => {
    const sanitized = JSON.stringify(sanitizeObservation({ token: 'secret', nested: { authorization: 'raw', text: 'Bearer abc sk-123456' }, list: Array(40).fill('x') }));
    expect(sanitized).not.toContain('secret'); expect(sanitized).not.toContain('raw'); expect(sanitized).not.toContain('abc'); expect(sanitized).toContain('[TRUNCATED]');
  });
});
