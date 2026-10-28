import { projectPublicEvent } from './chat.controller';

it('publishes only source metadata from knowledge.result', () => {
  const result = projectPublicEvent({
    runId: 'run-1', conversationId: 'conversation-1', seq: 2,
    timestamp: '2026-10-28T00:00:00Z', type: 'knowledge.result',
    data: {
      status: 'matched',
      chunks: [{ content: '内部片段正文' }],
      citations: [{
        knowledgeBaseId: 'kb-1', documentId: 'doc-1', chunkId: 'chunk-1', title: '报销规则',
        position: { page: 3 }, content: '内部片段正文', score: 0.82,
      }],
    },
  });

  expect(result.data).toEqual({
    status: 'matched',
    citations: [{
      knowledgeBaseId: 'kb-1', documentId: 'doc-1', chunkId: 'chunk-1', title: '报销规则',
      position: { page: 3 },
    }],
  });
});
