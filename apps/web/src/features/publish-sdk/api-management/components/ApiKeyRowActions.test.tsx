import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApiKeyRowActions } from './ApiKeyRowActions';

describe('ApiKeyRowActions', () => {
  it('renders enabled edit and delete controls', () => {
    const markup = renderToStaticMarkup(
      <ApiKeyRowActions
        apiKey={{
          id: 'test-key',
          agentId: 'agent-1',
          agentName: 'Agent One',
          name: 'Test key',
          maskedKey: 'mk_live_test••••••••',
          createdAt: '2026-10-28T00:00:00.000Z',
          lastUsedAt: null,
        }}
        onDeleted={() => undefined}
        onRefresh={async () => true}
        onNotice={() => undefined}
      />,
    );
    const editButton = markup.match(/<button[^>]*aria-label="编辑 [^"]*"[^>]*>/)?.[0];
    const deleteButton = markup.match(/<button[^>]*aria-label="删除 [^"]*"[^>]*>/)?.[0];

    expect(editButton).toBeDefined();
    expect(deleteButton).toBeDefined();
    expect(editButton).not.toContain('disabled');
    expect(deleteButton).not.toContain('disabled');
  });
});
