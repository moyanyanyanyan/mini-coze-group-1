import { describe, expect, it } from 'vitest';
import {
  MiniCozeClient,
  MiniCozeSDKError,
  type MiniCozeClientOptions,
} from '../src/index.js';

const validOptions: MiniCozeClientOptions = {
  baseURL: 'https://api.example.com/',
  apiKey: ' test-key ',
};

describe('MiniCozeClient configuration', () => {
  it('exports a validated client with normalized public configuration', () => {
    const client = new MiniCozeClient(validOptions);

    expect(client.baseURL).toBe('https://api.example.com');
    expect(client.timeoutMs).toBe(30_000);
    expect('apiKey' in client).toBe(false);
  });

  it('accepts an explicit timeout and local HTTP development URLs', () => {
    const client = new MiniCozeClient({
      ...validOptions,
      baseURL: 'http://localhost:3000',
      timeoutMs: 5_000,
    });

    expect(client.baseURL).toBe('http://localhost:3000');
    expect(client.timeoutMs).toBe(5_000);
  });

  it.each([
    [{ ...validOptions, baseURL: '' }, 'baseURL must be a non-empty string'],
    [{ ...validOptions, baseURL: 'not-a-url' }, 'baseURL must be a valid URL'],
    [{ ...validOptions, baseURL: 'ftp://api.example.com' }, 'baseURL must use HTTP or HTTPS'],
    [{ ...validOptions, apiKey: '   ' }, 'apiKey must be a non-empty string'],
    [{ ...validOptions, timeoutMs: 0 }, 'timeoutMs must be a positive finite number'],
    [{ ...validOptions, timeoutMs: Number.POSITIVE_INFINITY }, 'timeoutMs must be a positive finite number'],
  ])('rejects invalid configuration', (options, message) => {
    expect(() => new MiniCozeClient(options)).toThrow(new MiniCozeSDKError(message));
  });
});
