import { describe, expect, it } from 'vitest';
import {
  canSubmitName,
  getNameError,
  NAME_TOO_LONG_MESSAGE,
} from './api-key-form';

describe('API Key name validation', () => {
  it('rejects an empty name but accepts spaces without trimming', () => {
    expect(canSubmitName('')).toBe(false);
    expect(canSubmitName('   ')).toBe(true);
  });

  it('allows exactly 30 characters and rejects 31', () => {
    expect(getNameError('a'.repeat(30))).toBeNull();
    expect(getNameError('a'.repeat(31))).toBe(NAME_TOO_LONG_MESSAGE);
  });

  it('counts Unicode code points and allows internal or edge spaces', () => {
    expect(getNameError('😀'.repeat(30))).toBeNull();
    expect(getNameError(` 😀${'a'.repeat(27)} `)).toBeNull();
  });
});
