import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { KnowledgeService } from '../src/modules/knowledge/knowledge.service';
import { KnowledgeDocumentService } from '../src/modules/knowledge/documents/knowledge-document.service';

describe('Knowledge deletion cascade (e2e)', () => {
  const prisma = new PrismaClient();
  const workspaceId = `ws-delete-test-${randomUUID()}`;
  let knowledgeBaseId: string | undefined;

  afterAll(async () => {
    if (knowledgeBaseId) await prisma.knowledgeBase.deleteMany({ where: { id: knowledgeBaseId } });
    await prisma.$disconnect();
  });

  it('removes document chunks and vectors, then the remaining KB contents', async () => {
    const base = await prisma.knowledgeBase.create({ data: { workspaceId, name: 'Temporary deletion test' } });
    knowledgeBaseId = base.id;
    const vector = `[${[1, ...Array<number>(511).fill(0)].join(',')}]`;
    const createIndexedDocument = async () => {
      const document = await prisma.knowledgeDocument.create({
        data: { knowledgeBaseId: base.id, title: 'Temporary document', sourceType: 'TEXT', status: 'READY', stage: 'COMPLETED', chunkCount: 1 },
      });
      const chunk = await prisma.knowledgeChunk.create({
        data: { documentId: document.id, knowledgeBaseId: base.id, position: 0, content: 'Temporary content', startOffset: 0, endOffset: 17 },
      });
      await prisma.$executeRaw`
        INSERT INTO "KnowledgeChunkVector" ("chunkId", "model", "dimension", "embedding", "updatedAt")
        VALUES (${chunk.id}, 'delete-test-model', 512, ${vector}::vector, NOW())
      `;
      return { documentId: document.id, chunkId: chunk.id };
    };

    const first = await createIndexedDocument();
    const documentService = new KnowledgeDocumentService(prisma as never, {} as never);
    await documentService.remove(first.documentId, workspaceId);
    expect(await prisma.knowledgeDocument.count({ where: { id: first.documentId } })).toBe(0);
    expect(await prisma.knowledgeChunk.count({ where: { id: first.chunkId } })).toBe(0);
    const firstVectors = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "KnowledgeChunkVector" WHERE "chunkId" = ${first.chunkId}
    `;
    expect(firstVectors[0].count).toBe(0n);

    const second = await createIndexedDocument();
    const knowledgeService = new KnowledgeService(prisma as never);
    await knowledgeService.remove(base.id, workspaceId);
    knowledgeBaseId = undefined;
    expect(await prisma.knowledgeBase.count({ where: { id: base.id } })).toBe(0);
    expect(await prisma.knowledgeDocument.count({ where: { id: second.documentId } })).toBe(0);
    expect(await prisma.knowledgeChunk.count({ where: { id: second.chunkId } })).toBe(0);
    const secondVectors = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "KnowledgeChunkVector" WHERE "chunkId" = ${second.chunkId}
    `;
    expect(secondVectors[0].count).toBe(0n);
  });
});
