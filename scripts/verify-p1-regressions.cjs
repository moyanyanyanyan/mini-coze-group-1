// Live acceptance for the two P1 parsing regressions. Run against a disposable local backend.
//
// [P1] hybrid PDF: a selectable title over an image-only body must still reach OCR and rawText.
// [P1] Office: a document starting with an empty table cell keeps a leading tab in rawText, so
//      chunk offsets must stay measured on the untrimmed text.
//
// Usage: node scripts/verify-p1-regressions.cjs [--base-url http://127.0.0.1:3000] [--output out.json]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const base = option('--base-url', 'http://127.0.0.1:3000');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Loopback server required');
const output = option('--output');
const workspaceId = 'ws-local-demo';
const repository = path.resolve(__dirname, '..');
const fixture = (name) => fs.readFileSync(path.join(repository, 'apps/backend/test/fixtures', name));
// Prisma Client resolves DATABASE_URL from the schema directory, not from this script's cwd.
if (!process.env.DATABASE_URL) {
  const envPath = path.join(repository, '.env');
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('DATABASE_URL='));
  assert(line, 'DATABASE_URL is required');
  process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).trim();
}
const { PrismaClient } = require(path.join(repository, 'apps/backend/node_modules/@prisma/client'));
const prisma = new PrismaClient();

const report = { base, workspaceId, run: new Date().toISOString(), knowledgeBaseId: null, cases: [] };
const save = () => output && fs.writeFileSync(output, JSON.stringify(report, null, 2));

async function request(route, options) {
  const response = await fetch(new URL(`/api/${route}`, base), {
    ...options, signal: AbortSignal.timeout(180_000),
  });
  const body = await response.json().catch(() => ({}));
  return { http: response.status, body, data: body.data };
}
const json = (route, body) => request(route, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
async function upload(knowledgeBaseId, name, bytes, type) {
  const form = new FormData();
  form.set('workspaceId', workspaceId);
  form.set('file', new Blob([bytes], { type }), name);
  // The demo guard reads workspaceId from the query string before multipart is parsed.
  return request(`knowledge-bases/${knowledgeBaseId}/documents/files?workspaceId=${workspaceId}`, {
    method: 'POST', body: form,
  });
}
async function waitForDocument(id) {
  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) {
    const result = await request(`documents/${id}?workspaceId=${workspaceId}`);
    assert.equal(result.http, 200, JSON.stringify(result.body));
    if (result.data.status !== 'PROCESSING') return result.data;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for document ${id}`);
}

(async () => {
  const created = await json('knowledge-bases', {
    workspaceId, name: `P1 acceptance ${new Date().toISOString()}`, description: 'P1 regression acceptance',
  });
  assert.equal(created.http, 200, JSON.stringify(created.body));
  const knowledgeBaseId = created.data.id;
  report.knowledgeBaseId = knowledgeBaseId;
  save();
  console.log(`Knowledge base ${knowledgeBaseId}`);

  const cases = [
    { name: 'hybrid-title-image-body.pdf', type: 'PDF', mime: 'application/pdf' },
    { name: 'office-empty-first-cell.docx', type: 'DOCX' },
  ];

  for (const item of cases) {
    const bytes = fixture(item.name);
    const accepted = await upload(knowledgeBaseId, item.name, bytes, item.mime ?? 'application/octet-stream');
    assert.equal(accepted.http, 202, JSON.stringify(accepted.body));
    console.log(`Accepted ${item.name} as ${accepted.data.id}; waiting for real parsing`);
    const ready = await waitForDocument(accepted.data.id);
    assert.equal(ready.status, 'READY', JSON.stringify(ready));

    const content = await request(`documents/${ready.id}/content?workspaceId=${workspaceId}`);
    const rawText = content.data.content;
    const chunks = await request(`knowledge-bases/${knowledgeBaseId}/documents/${ready.id}/chunks?workspaceId=${workspaceId}`);
    assert.equal(chunks.http, 200);
    assert.equal(chunks.data.total, ready.chunkCount);

    // Every chunk must slice back out of the untrimmed rawText, exactly.
    for (const chunk of chunks.data.items) {
      assert.equal(rawText.slice(chunk.startOffset, chunk.endOffset), chunk.content,
        `chunk ${chunk.position} offsets do not index rawText`);
    }

    const vectors = await prisma.$queryRaw`
      SELECT count(*)::int AS count, min(v.dimension)::int AS dimension
      FROM "KnowledgeChunkVector" v
      JOIN "KnowledgeChunk" c ON c.id = v."chunkId"
      WHERE c."documentId" = ${ready.id}`;
    assert.equal(vectors[0].count, ready.chunkCount, 'every chunk needs a vector');
    assert.equal(vectors[0].dimension, 512);

    const caseReport = {
      name: item.name, sourceType: item.type, documentId: ready.id, status: ready.status,
      chunkCount: ready.chunkCount, rawTextLength: rawText.length, rawText,
      chunks: chunks.data.items.map((chunk) => ({
        position: chunk.position, startOffset: chunk.startOffset, endOffset: chunk.endOffset,
        content: chunk.content, hasSourceRanges: Boolean(chunk.sourceRanges?.ranges?.length),
      })),
      vectors: vectors[0],
    };

    if (item.type === 'PDF') {
      // The regression: rawText used to be exactly the native title, with no OCR call at all.
      assert.equal(rawText, 'Contract terms\nPAYMENT DUE IN 30 DAYS\nINVOICE APPROVAL REQUIRED');
      assert.equal(rawText.match(/contract terms/gi).length, 1, 'title must not be duplicated');
      const search = await json(`knowledge-bases/${knowledgeBaseId}/retrieval-preview`, {
        workspaceId, query: 'PAYMENT DUE IN 30 DAYS',
      });
      assert.equal(search.data.status, 'HIT', JSON.stringify(search.body));
      assert(search.data.hits.some((hit) => hit.documentId === ready.id));
      caseReport.retrieval = search.data.status;
    }

    if (item.type === 'DOCX') {
      // The regression: processing used to fail with CHUNK_SOURCE_MISMATCH.
      assert.equal(rawText, '\tImportant body');
      assert.equal(chunks.data.items[0].startOffset, 1);
      assert.equal(chunks.data.items[0].content, 'Important body');
      assert(chunks.data.items[0].sourceRanges.ranges.length > 0);
      assert.equal(chunks.data.items[0].sourceRanges.ranges[0].kind, 'tableCell');
      const search = await json(`knowledge-bases/${knowledgeBaseId}/retrieval-preview`, {
        workspaceId, query: 'Important body',
      });
      assert.equal(search.data.status, 'HIT', JSON.stringify(search.body));
      caseReport.retrieval = search.data.status;
    }

    report.cases.push(caseReport);
    save();
    console.log(`PASS ${item.name}: READY, ${ready.chunkCount} chunk(s), vectors ${vectors[0].count}x${vectors[0].dimension}`);
  }

  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  report.failure = error.message;
  save();
  console.error('FAILED:', error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
