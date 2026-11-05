import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { KnowledgeRetrievalService } from '../src/modules/knowledge/retrieval/knowledge-retrieval.service';

async function main() {
  const [knowledgeBaseId, query, expectedStatus = 'HIT'] = process.argv.slice(2);
  if (!knowledgeBaseId || !query || !['HIT', 'NO_HIT'].includes(expectedStatus)) {
    throw new Error('用法：ts-node scripts/retrieval-smoke.ts <knowledgeBaseId> <问题> [HIT|NO_HIT]');
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const result = await app.get(KnowledgeRetrievalService).searchAuthorized([knowledgeBaseId], query, 5);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== expectedStatus) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
