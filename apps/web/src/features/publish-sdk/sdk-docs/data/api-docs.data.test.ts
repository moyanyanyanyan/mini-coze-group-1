import { describe, expect, it } from 'vitest';
import {
  API_DOC_SECTIONS,
  FAQ_ITEMS,
  QUICK_START_SAMPLES,
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

  it('includes every required SSE event and FAQ entry', () => {
    expect(SSE_EVENTS.map((event) => event.name)).toEqual([
      'start',
      'token',
      'tool_call',
      'tool_result',
      'reference',
      'done',
      'error',
    ]);
    expect(FAQ_ITEMS).toHaveLength(5);
  });
});
