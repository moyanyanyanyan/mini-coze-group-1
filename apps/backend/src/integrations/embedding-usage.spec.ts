import { EmbeddingClient } from './embedding.client';

it('记录模型实际返回的 Token，缺报保留 null，零值不当成缺报', async () => {
  const original = { ...process.env };
  process.env.AGENT_SERVICE_URL = 'http://agent.test'; process.env.INTERNAL_SERVICE_TOKEN = 'test-only';
  const model = `${process.env.EMBEDDING_MODEL ?? 'BAAI/bge-small-zh-v1.5'}@${process.env.EMBEDDING_MODEL_REVISION ?? '7999e1d3359715c523056ef9478215996d62a620'}`;
  const record = jest.fn();
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  try {
    for (const usage of [{ inputTokens: 0 }, { inputTokens: 17 }, undefined]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ model, dimension: 512, vectors: [Array(512).fill(.01)], ...(usage ? { usage } : {}) }), { status: 200 }));
      const result = await new EmbeddingClient({ record } as never).embed(['中文问题'], { ownerId: 'owner', source: 'retrieval', knowledgeBaseIds: ['base'] });
      expect(result.vectors).toHaveLength(1);
      expect(record.mock.calls.at(-1)![0]).toMatchObject({ ownerId: 'owner', knowledgeBaseId: 'base', inputTokens: usage?.inputTokens ?? null, kind: 'embedding', data: expect.objectContaining({ source: 'retrieval' }) });
    }
  } finally { fetchMock.mockRestore(); process.env = original; }
});
