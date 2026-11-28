import { KnowledgeDocumentService } from './knowledge-document.service';

describe('KnowledgeDocumentService processing adapters', () => {
  function createHarness(sourceType: 'MARKDOWN' | 'HTML') {
    const updates: Record<string, unknown>[] = [];
    const persisted: Record<string, unknown>[] = [];
    const prisma: {
      knowledgeBase: { findUniqueOrThrow: jest.Mock };
      knowledgeDocument: {
        findUniqueOrThrow: jest.Mock;
        update: jest.Mock;
      };
      knowledgeChunk: {
        deleteMany: jest.Mock;
        createMany: jest.Mock;
      };
      $transaction: jest.Mock;
      $executeRaw: jest.Mock;
    } = {
      knowledgeBase: { findUniqueOrThrow: jest.fn().mockResolvedValue({ workspaceId: 'ws' }) },
      knowledgeDocument: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          sourceType,
          sourceBytes:
            sourceType === 'MARKDOWN'
              ? Buffer.from('# 标题\n\n正文内容。\n\n- 列表项')
              : Buffer.from(
                  '<main><h1>标题</h1><p>正文内容。</p><footer>版权</footer></main>',
                ),
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return {};
        }),
      },
      knowledgeChunk: {
        deleteMany: jest.fn(),
        createMany: jest.fn(
          async ({ data }: { data: Record<string, unknown>[] }) => {
            persisted.push(...data);
            return { count: data.length };
          },
        ),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      ),
      $executeRaw: jest.fn(),
    };

    const embedding = {
      embed: jest.fn(async (texts: string[]) => ({
        model: 'test-model',
        vectors: texts.map(() => Array.from({ length: 512 }, () => 0.1)),
      })),
    };

    const service = new KnowledgeDocumentService(
      prisma as never,
      embedding as never,
      {} as never,
    );
    return { service, prisma, embedding, updates, persisted };
  }

  it('persists normalized markdown rawText and chunks that point back to it', async () => {
    const harness = createHarness('MARKDOWN');
    await (
      harness.service as unknown as { process(id: string): Promise<void> }
    ).process('doc-1');

    const rawText = harness.updates.find(
      (update) => typeof update.rawText === 'string',
    )?.rawText as string;
    expect(rawText).toBe('标题\n\n正文内容。\n\n- 列表项');
    expect(rawText).not.toContain('# 标题');

    expect(harness.persisted.length).toBeGreaterThan(0);
    for (const chunk of harness.persisted) {
      const startOffset = chunk.startOffset as number;
      const endOffset = chunk.endOffset as number;
      expect(rawText.slice(startOffset, endOffset)).toBe(chunk.content);
    }
    expect(harness.updates.at(-1)).toMatchObject({
      status: 'READY',
      stage: 'COMPLETED',
      chunkCount: harness.persisted.length,
    });
    expect(harness.embedding.embed).toHaveBeenCalledTimes(1);
  });

  it('uses the HTML adapter and drops footer text before persistence', async () => {
    const harness = createHarness('HTML');
    await (
      harness.service as unknown as { process(id: string): Promise<void> }
    ).process('doc-1');

    const rawText = harness.updates.find(
      (update) => typeof update.rawText === 'string',
    )?.rawText as string;
    expect(rawText).toBe('标题\n\n正文内容。');
    expect(rawText).not.toContain('版权');
  });
});
