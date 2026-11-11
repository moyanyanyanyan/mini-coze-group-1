import { describe, expect, it } from 'vitest';
import { tokenizeCode } from './CodeBlock';

describe('code highlighting', () => {
  it('keeps all source text while classifying comments, strings and keywords', () => {
    const source = `const message = 'Hello'; // Mock\nawait client.run();`;
    const tokens = tokenizeCode(source);

    expect(tokens.map((token) => token.text).join('')).toBe(source);
    expect(tokens).toContainEqual({ text: 'const', kind: 'keyword' });
    expect(tokens).toContainEqual({ text: "'Hello'", kind: 'string' });
    expect(tokens).toContainEqual({ text: '// Mock', kind: 'comment' });
  });
});
