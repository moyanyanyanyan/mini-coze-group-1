import { describe, expect, it } from 'vitest';
import {
  API_DOC_SECTIONS,
  ENDPOINTS,
  ENV_SAMPLE,
  EXAMPLE_CLIENT_SAMPLE,
  EXAMPLE_RUN_SAMPLE,
  EXAMPLE_STREAM_SAMPLE,
  FAQ_ITEMS,
  FIRST_RUN_SAMPLE,
  HTTP_STATUSES,
  QUICK_START_SAMPLES,
  REQUEST_PARAMETERS,
  RUNTIME_ERRORS,
  RUN_ERROR_SAMPLE,
  RUN_REQUEST_SAMPLE,
  RUN_RESPONSE_SAMPLE,
  SDK_ERROR_SAMPLE,
  SDK_EXPORTS,
  SDK_INIT_SAMPLE,
  SDK_INSTALL_SAMPLE,
  SDK_TYPES,
  SSE_EVENTS,
  STREAM_FAILED_EVENT_SAMPLE,
  STREAM_REQUEST_SAMPLE,
  STREAM_RESPONSE_SAMPLE,
  STREAM_SDK_SAMPLE,
  TOOL_EVENTS_SAMPLE,
} from './api-docs.data';
import { MiniCozeClient } from '../../../../../../../packages/sdk/src/client';
import * as sdkExports from '../../../../../../../packages/sdk/src/index';

describe('API docs content', () => {
  it('defines the seven sections in reading order', () => {
    expect(API_DOC_SECTIONS.map((section) => section.id)).toEqual([
      'quick-start',
      'integration-choice',
      'run-sync',
      'stream',
      'example-project',
      'api-reference',
      'errors-faq',
    ]);
    expect(new Set(API_DOC_SECTIONS.map((section) => section.id)).size).toBe(7);
  });

  it('installs the SDK with the documented package name', () => {
    expect(SDK_INSTALL_SAMPLE.code).toBe('npm install @minicoze/sdk');
  });

  it('initializes the client with the real constructor options', () => {
    expect(SDK_INIT_SAMPLE.code).toContain('new MiniCozeClient(');
    expect(SDK_INIT_SAMPLE.code).toContain('baseURL');
    expect(SDK_INIT_SAMPLE.code).toContain('apiKey');
    expect(SDK_INIT_SAMPLE.code).toContain('timeoutMs');
    expect(ENV_SAMPLE.code).toContain('MINICOZE_API_KEY');
  });

  it('uses the real run() API and reads RunResult fields', () => {
    expect(FIRST_RUN_SAMPLE.code).toContain('client.run({');
    expect(FIRST_RUN_SAMPLE.code).toContain('result.content');
    expect(FIRST_RUN_SAMPLE.code).toContain('result.conversationId');
    expect(QUICK_START_SAMPLES.map((sample) => sample.id)).toEqual(['sdk', 'curl']);
    expect(QUICK_START_SAMPLES[0].code).toContain('client.run(');
  });

  it('matches the implemented non-stream Run contract', () => {
    expect(ENDPOINTS[0]).toMatchObject({ method: 'POST', path: '/api/v1/run' });
    expect(REQUEST_PARAMETERS.map((row) => row.name)).toEqual(['message', 'conversationId']);
    expect(RUN_REQUEST_SAMPLE.code).toContain('/api/v1/run');
    expect(RUN_REQUEST_SAMPLE.code).not.toContain('agentId');
    expect(RUN_RESPONSE_SAMPLE.code).toContain('"assistantMessageId"');
    expect(RUN_RESPONSE_SAMPLE.code).toContain('"finishReason": "stop"');
    expect(RUN_RESPONSE_SAMPLE.code).toContain('"toolResults"');
    expect(RUN_ERROR_SAMPLE.code).toContain('"code": 503');
    expect(RUN_ERROR_SAMPLE.code).toContain('"data": null');
  });

  it('matches the SDK stream() API and SSE event union', () => {
    expect(STREAM_SDK_SAMPLE.code).toContain('client.stream(');
    expect(STREAM_SDK_SAMPLE.code).toContain('AbortController');
    expect(STREAM_SDK_SAMPLE.code).toContain("case 'message.delta':");
    expect(STREAM_SDK_SAMPLE.code).toContain("case 'run.completed':");
    expect(STREAM_SDK_SAMPLE.code).toContain("case 'run.failed':");
    expect(STREAM_SDK_SAMPLE.code).not.toContain('/internal/runtime');

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
    expect(STREAM_RESPONSE_SAMPLE.code).toContain('event: run.started');
    expect(STREAM_RESPONSE_SAMPLE.code).toContain('id: run_example:1');
    expect(TOOL_EVENTS_SAMPLE.code).toContain('"status":"failed"');
    expect(TOOL_EVENTS_SAMPLE.code).toContain('"status":"succeeded"');
    expect(STREAM_FAILED_EVENT_SAMPLE.code).toContain('event: run.failed');
  });

  it('documents the error classes that the SDK actually exports', () => {
    for (const name of [
      'MiniCozeSDKError',
      'MiniCozeHTTPError',
      'MiniCozeNetworkError',
      'MiniCozeTimeoutError',
      'MiniCozeAbortError',
      'MiniCozeResponseParseError',
      'MiniCozeStreamError',
    ]) {
      expect(sdkExports).toHaveProperty(name);
    }
    expect(SDK_ERROR_SAMPLE.code).toContain('MiniCozeHTTPError');
    expect(SDK_ERROR_SAMPLE.code).toContain('MiniCozeTimeoutError');
    expect(SDK_ERROR_SAMPLE.code).toContain('MiniCozeAbortError');
    expect(SDK_EXPORTS.some((row) => row.name.includes('MiniCozeClient'))).toBe(true);
    expect(typeof MiniCozeClient).toBe('function');
  });

  it('ships a runnable example project built from real SDK calls', () => {
    expect(EXAMPLE_CLIENT_SAMPLE.code).toContain('new MiniCozeClient(');
    expect(EXAMPLE_CLIENT_SAMPLE.code).toContain('MINICOZE_API_KEY');
    expect(EXAMPLE_RUN_SAMPLE.code).toContain('client.run(');
    expect(EXAMPLE_STREAM_SAMPLE.code).toContain('client.stream(');
    expect(EXAMPLE_STREAM_SAMPLE.code).toContain('MiniCozeAbortError');
  });

  it('keeps reference tables aligned with the backend', () => {
    expect(ENDPOINTS[1]).toMatchObject({ method: 'POST', path: '/api/v1/stream' });
    expect(HTTP_STATUSES.some((item) => item.status === '501')).toBe(false);
    expect(HTTP_STATUSES.some((item) => item.status === '403')).toBe(true);
    expect(RUNTIME_ERRORS).toHaveLength(32);
    expect(SDK_TYPES.map((row) => row.name)).toEqual([
      'MiniCozeClientOptions',
      'RunParams',
      'RunOptions',
      'RunResult',
      'StreamOptions',
      'RunStreamEvent',
    ]);
    expect(FAQ_ITEMS).toHaveLength(8);
  });
});
