import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { EmbeddingClient, EmbeddingUnavailableError } from '../../../integrations/embedding.client';

export interface KnowledgeHit {
  chunkId: string;
  knowledgeBaseId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
}

@Injectable()
export class KnowledgeRetrievalService {
  constructor(private readonly prisma: PrismaService, private readonly embedding: EmbeddingClient) {}

  // The caller must first verify actor, agent, workspace and binding permissions.
  async searchAuthorized(knowledgeBaseIds: string[], query: string, topK = 5): Promise<{ status: 'HIT' | 'NO_HIT'; hits: KnowledgeHit[] }> {
    try {
      return await this.performSearch(knowledgeBaseIds, query, topK);
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('知识库检索服务不可用');
    }
  }

  private async performSearch(knowledgeBaseIds: string[], query: string, topK: number): Promise<{ status: 'HIT' | 'NO_HIT'; hits: KnowledgeHit[] }> {
    const ids = [...new Set(knowledgeBaseIds)];
    if (ids.length !== knowledgeBaseIds.length || ids.length === 0 || topK !== 5) {
      throw new ForbiddenException('知识库检索范围无效');
    }
    const bases = await this.prisma.knowledgeBase.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      select: { id: true, workspaceId: true },
    });
    if (bases.length !== ids.length || new Set(bases.map((base) => base.workspaceId)).size !== 1) {
      throw new ForbiddenException('知识库不存在或不可访问');
    }

    const readyChunk = await this.prisma.knowledgeChunk.findFirst({
      where: { knowledgeBaseId: { in: ids }, enabled: true, document: { status: 'READY' }, vector: { isNot: null } },
      select: { id: true },
    });
    if (!readyChunk) return { status: 'NO_HIT', hits: [] };

    let model: string;
    let vector: string;
    try {
      const embedded = await this.embedding.embed([query]);
      model = embedded.model;
      vector = `[${embedded.vectors[0].join(',')}]`;
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw new ServiceUnavailableException('Embedding 服务不可用');
      throw error;
    }

    const incompatibleChunk = await this.prisma.knowledgeChunk.findFirst({
        where: {
          knowledgeBaseId: { in: ids }, enabled: true, document: { status: 'READY' },
          vector: { is: { model: { not: model } } },
        },
        select: { id: true },
    });
    if (incompatibleChunk) throw new ServiceUnavailableException('知识库向量模型版本不一致，需要重新索引');

    const hits: KnowledgeHit[] = [];
    for (const knowledgeBaseId of ids) {
      const rows = await this.prisma.$queryRaw<KnowledgeHit[]>(Prisma.sql`
          SELECT c.id AS "chunkId", c."knowledgeBaseId", c."documentId",
                 d.title AS "documentTitle", c.content,
                 (1 - (v.embedding <=> ${vector}::vector))::double precision AS score
          FROM "KnowledgeChunk" c
          JOIN "KnowledgeChunkVector" v ON v."chunkId" = c.id
          JOIN "KnowledgeDocument" d ON d.id = c."documentId"
          JOIN "KnowledgeBase" kb ON kb.id = c."knowledgeBaseId"
          WHERE c."knowledgeBaseId" = ${knowledgeBaseId}
            AND c.enabled = true AND d.status = 'READY' AND kb.status = 'ACTIVE'
            AND v.model = ${model} AND v.dimension = 512
          ORDER BY v.embedding <=> ${vector}::vector, c.id
          LIMIT ${topK}
      `);
      hits.push(...rows);
    }
    hits.sort((a, b) => b.score - a.score || a.knowledgeBaseId.localeCompare(b.knowledgeBaseId) ||
      a.documentId.localeCompare(b.documentId) || a.chunkId.localeCompare(b.chunkId));
    return { status: hits.length ? 'HIT' : 'NO_HIT', hits };
  }
}
