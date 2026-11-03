import { describe, expect, it } from 'vitest';
import {
  API_DOC_SECTIONS,
  ENDPOINTS,
  FAQ_ITEMS,
  QUICK_START_SAMPLES,
  REQUEST_PARAMETERS,
  RUN_ERROR_SAMPLE,
  RUN_REQUEST_SAMPLE,
  RUN_RESPONSE_SAMPLE,
  SDK_TYPES,
  SSE_EVENTS,
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

  it('keeps the unimplemented Stream contract explicitly pending', () => {
    expect(SSE_EVENTS).toEqual([]);
    expect(SDK_TYPES.map((row) => row.name)).toEqual([
      'MiniCozeClientOptions',
      'RunParams',
      'RunOptions',
      'RunResult',
    ]);
    expect(FAQ_ITEMS).toHaveLength(5);
  });
});
