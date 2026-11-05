import { Injectable } from '@nestjs/common';

export const EMBEDDING_DIMENSION = 512;
const BATCH_SIZE = 16;

export class EmbeddingUnavailableError extends Error {
  constructor(message = 'Embedding 服务不可用或返回的向量无效') { super(message); }
}

@Injectable()
export class EmbeddingClient {
  async embed(texts: string[]): Promise<{ model: string; vectors: number[][] }> {
    const serviceUrl = process.env.AGENT_SERVICE_URL;
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    const expectedModel = process.env.EMBEDDING_MODEL ?? 'BAAI/bge-small-zh-v1.5';
    const expectedRevision = process.env.EMBEDDING_MODEL_REVISION ?? '7999e1d3359715c523056ef9478215996d62a620';
    if (!serviceUrl || !token) throw new EmbeddingUnavailableError('Embedding 服务地址或内部凭证未配置');

    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      let response: Response;
      try {
        response = await fetch(new URL('/internal/knowledge/embeddings', serviceUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ texts: texts.slice(start, start + BATCH_SIZE) }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch {
        throw new EmbeddingUnavailableError();
      }
      if (!response.ok) throw new EmbeddingUnavailableError();

      let body: unknown;
      try { body = await response.json(); } catch { throw new EmbeddingUnavailableError(); }
      if (!isEmbeddingResponse(body, `${expectedModel}@${expectedRevision}`, Math.min(BATCH_SIZE, texts.length - start))) {
        throw new EmbeddingUnavailableError();
      }
      vectors.push(...body.vectors);
    }
    return { model: `${expectedModel}@${expectedRevision}`, vectors };
  }
}

function isEmbeddingResponse(value: unknown, model: string, count: number): value is { model: string; dimension: number; vectors: number[][] } {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return result.model === model && result.dimension === EMBEDDING_DIMENSION &&
    Array.isArray(result.vectors) && result.vectors.length === count &&
    result.vectors.every((vector: unknown) => Array.isArray(vector) && vector.length === EMBEDDING_DIMENSION &&
      vector.every((item: unknown) => typeof item === 'number' && Number.isFinite(item)) &&
      vector.some((item: number) => item !== 0));
}
