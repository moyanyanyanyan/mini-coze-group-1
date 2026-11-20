// 使用本地测试数据库运行：node --env-file=../../.env scripts/test-operations-document-history.cjs
// 先构建后端并部署迁移；只清理本脚本创建的临时知识库。
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { KnowledgeDocumentService } = require('../dist/modules/knowledge/documents/knowledge-document.service');
const { EmbeddingUnavailableError } = require('../dist/integrations/embedding.client');
const { DocumentHistoryService } = require('../dist/modules/operations/collection/document-history.service');
const { OperationsService } = require('../dist/modules/operations/operations.service');
const db = new PrismaClient();
const owner = randomUUID();
let base;
let success = false;
const embedding = { embed: async texts => {
  if (!success) throw new EmbeddingUnavailableError('受控测试失败');
  return { model: 'operations-history-test', vectors: texts.map(() => [1, ...Array(511).fill(0)]) };
} };
async function settled(id, expected) {
  for (let i = 0; i < 100; i++) {
    const doc = await db.knowledgeDocument.findUniqueOrThrow({ where: { id } });
    if (doc.status === expected) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('文档处理未在测试期限内结束');
}
async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本地数据库');
  base = await db.knowledgeBase.create({ data: { workspaceId: owner, name: 'operations-history-test' } });
  const knowledge = new KnowledgeDocumentService(db, embedding);
  const document = await knowledge.createText(base.id, { workspaceId: owner, title: '重试验证', text: '这是一份用于重试历史的测试文本。' });
  await settled(document.id, 'FAILED');
  const retry = await Promise.allSettled([knowledge.retry(document.id, owner), knowledge.retry(document.id, owner)]);
  assert.equal(retry.filter(item => item.status === 'fulfilled').length, 1);
  await settled(document.id, 'FAILED');
  success = true;
  await knowledge.retry(document.id, owner);
  await settled(document.id, 'READY');
  const attempts = await db.operationDocumentAttempt.findMany({ where: { documentId: document.id }, orderBy: { ordinal: 'asc' } });
  assert.deepEqual(attempts.map(a => [a.source, a.status]), [['INITIAL', 'FAILED'], ['RETRY', 'FAILED'], ['RETRY', 'READY']]);
  assert.equal(attempts[0].stage, 'EMBEDDING');
  assert.equal(attempts[0].errorCode, 'EMBEDDING_UNAVAILABLE');
  assert(attempts.every(a => a.startedAt && a.finishedAt && a.finishedAt >= a.startedAt));
  assert(attempts[2].events.some(event => event.stage === 'PERSISTING'));
  const history = new DocumentHistoryService(db);
  assert.equal((await history.list(owner, base.id, document.id, { page: 1, pageSize: 1 })).total, 3);
  await assert.rejects(history.list('other-owner', base.id, document.id, { page: 1, pageSize: 20 }), e => e.status === 404);
  await assert.rejects(history.list(owner, 'wrong-base', document.id, { page: 1, pageSize: 20 }), e => e.status === 404);
  const list = await new OperationsService(db).documents(owner, base.id, { page: 1, pageSize: 20 });
  assert.deepEqual(list.items[0].attempts, { recordedCount: 3, latestSource: 'RETRY', latestStatus: 'READY' });

  const legacy = await db.knowledgeDocument.create({ data: { knowledgeBaseId: base.id, title: '旧文件', sourceType: 'TEXT', status: 'FAILED', stage: 'FAILED', errorCode: 'OLD_ERROR', errorMessage: '原错误', sourceBytes: Buffer.from('旧文件文本') } });
  await db.operationDocumentAttempt.deleteMany({ where: { documentId: legacy.id } });
  await assert.rejects(db.$transaction(async tx => {
    await tx.knowledgeDocument.update({ where: { id: legacy.id }, data: { status: 'PROCESSING', stage: 'VALIDATING' } });
    throw new Error('rollback-test');
  }), /rollback-test/);
  assert.equal(await db.operationDocumentAttempt.count({ where: { documentId: legacy.id } }), 0);
  await knowledge.retry(legacy.id, owner);
  await settled(legacy.id, 'READY');
  const legacyHistory = await db.operationDocumentAttempt.findMany({ where: { documentId: legacy.id }, orderBy: { ordinal: 'asc' } });
  assert.deepEqual(legacyHistory.map(a => a.source), ['OBSERVED', 'RETRY']);
  assert.equal(legacyHistory[0].startedAt, null);
  assert.equal(legacyHistory[0].errorMessage, '原错误');
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Asia/Shanghai'");
    const zoned = await tx.knowledgeDocument.create({ data: { knowledgeBaseId: base.id, title: '时区测试', sourceType: 'TEXT' } });
    const attempt = await tx.operationDocumentAttempt.findFirstOrThrow({ where: { documentId: zoned.id } });
    assert(Math.abs(attempt.startedAt.getTime() - Date.now()) < 5000, '记录时间不能被会话时区偏移');
  });
  const documentIds = [document.id, legacy.id];
  await db.knowledgeBase.delete({ where: { id: base.id } }); base = null;
  assert.equal(await db.operationDocumentAttempt.count({ where: { documentId: { in: documentIds } } }), 0);
  console.log('通过：真实处理失败→并发重试→成功、失败阶段保留、旧状态快照、事务回滚、分页、权限及级联清理');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (base) await db.knowledgeBase.delete({ where: { id: base.id } });
  await db.$disconnect();
});
