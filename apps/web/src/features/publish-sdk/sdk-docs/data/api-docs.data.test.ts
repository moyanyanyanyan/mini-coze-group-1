import { describe, expect, it } from 'vitest';
import {
  API_DOC_SECTIONS,
  ENDPOINTS,
  FAQ_ITEMS,
  HTTP_STATUSES,
  QUICK_START_SAMPLES,
  RUNTIME_ERRORS,
  REQUEST_PARAMETERS,
  RUN_ERROR_SAMPLE,
  RUN_REQUEST_SAMPLE,
  RUN_RESPONSE_SAMPLE,
  SDK_INSTALL_SAMPLE,
  SDK_INIT_SAMPLE,
  SDK_TYPES,
  SSE_EVENTS,
  STREAM_FAILED_EVENT_SAMPLE,
  STREAM_REQUEST_SAMPLE,
  STREAM_RESPONSE_SAMPLE,
  STREAM_SDK_SAMPLE,
  TOOL_EVENTS_SAMPLE,
} from './api-docs.data';

describe('API docs mock content', () => {
  it('defines unique document sections and the required examples', () => {
    const ids = API_DOC_SECTIONS.map((section) => section.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(API_DOC_SECTIONS).toHaveLength(7);
    expect(QUICK_START_SAMPLES.map((sample) => sample.label)).toEqual([
      'curl',
      'TypeScript SDK',
    ]);
  });

  it('matches the implemented non-stream Run contract', () => {
    expect(ENDPOINTS[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/run',
    });
    expect(REQUEST_PARAMETERS.map((row) => row.name)).toEqual([
      'message',
      'conversationId',
    ]);
    expect(RUN_REQUEST_SAMPLE.code).toContain('/api/v1/run');
    expect(RUN_REQUEST_SAMPLE.code).toContain('"message": "你好"');
    expect(RUN_REQUEST_SAMPLE.code).not.toContain('agentId');
    expect(RUN_RESPONSE_SAMPLE.code).toContain('"assistantMessageId"');
    expect(RUN_RESPONSE_SAMPLE.code).toContain('"finishReason": "stop"');
    expect(RUN_RESPONSE_SAMPLE.code).toContain('"promptTokens": 12');
    expect(RUN_ERROR_SAMPLE.code).toContain('"code": 503');
    expect(RUN_ERROR_SAMPLE.code).toContain('"data": null');
  });

  it('matches the implemented Stream contract', () => {
    expect(ENDPOINTS[1]).toMatchObject({
      method: 'POST',
      path: '/api/v1/stream',
    });
    expect(SSE_EVENTS.map((event) => event.name)).toEqual([
      'run.started',
      'knowledge.result',
      'message.delta',
      'tool.started',
      'tool.completed',
      'run.completed',
      'run.failed',
    ]);
    expect(STREAM_REQUEST_SAMPLE.code).toContain('/api/v1/stream');
    expect(STREAM_REQUEST_SAMPLE.code).toContain('Accept: text/event-stream');
    expect(STREAM_REQUEST_SAMPLE.code).not.toContain('agentId');
    expect(STREAM_RESPONSE_SAMPLE.code).toContain('id: run_example:1');
    expect(TOOL_EVENTS_SAMPLE.code).toContain('event: tool.started');
    expect(TOOL_EVENTS_SAMPLE.code).toContain('"status":"failed"');
    expect(TOOL_EVENTS_SAMPLE.code).toContain('"status":"succeeded"');
    expect(STREAM_FAILED_EVENT_SAMPLE.code).toContain('event: run.failed');
    expect(SSE_EVENTS.every((event) => event.data.length > 0)).toBe(true);
    expect(SDK_INIT_SAMPLE.code).toContain('MiniCozeClient');
    expect(SDK_INIT_SAMPLE.code).toContain('http://127.0.0.1:3000');
    expect(SDK_INSTALL_SAMPLE.code).toBe(
      'npm install https://github.com/moyanyanyanyan/mini-coze-group-1/releases/download/v0.1.0/minicoze-sdk-0.1.0.tgz',
    );
    expect(SDK_INSTALL_SAMPLE.code).not.toContain('<release-tag>');
    expect(SDK_INSTALL_SAMPLE.code).not.toContain('<sdk-asset>');
    expect(STREAM_SDK_SAMPLE.code).toContain('client.stream');
    expect(STREAM_SDK_SAMPLE.code).toContain("event.type === 'tool.completed'");
    expect(STREAM_SDK_SAMPLE.code).not.toContain('/internal/runtime');
    expect(HTTP_STATUSES.some((item) => item.status === '501')).toBe(false);
    expect(SDK_TYPES.map((row) => row.name)).toEqual([
      'MiniCozeClientOptions',
      'RunParams',
      'RunOptions',
      'RunResult',
      'StreamOptions',
      'RunStreamEvent',
    ]);
    expect(FAQ_ITEMS).toHaveLength(6);
    expect(FAQ_ITEMS.some((item) => item.answer.includes('临时测试 Agent'))).toBe(false);
    expect(RUNTIME_ERRORS).toHaveLength(32);
  });
});
