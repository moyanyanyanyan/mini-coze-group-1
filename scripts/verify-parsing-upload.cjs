// Real HTTP acceptance runner. Run only against a disposable local test database.
// Usage: node scripts/verify-parsing-upload.cjs --fixtures <dir> --output <json>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const base = option('--base-url', 'http://127.0.0.1:3100');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Loopback server required');
const fixtures = option('--fixtures');
const output = option('--output');
assert(fixtures && output, '--fixtures and --output are required');
const workspaceId = 'ws-local-demo';
const run = Date.now();
const report = args.includes('--resume') && fs.existsSync(output)
  ? JSON.parse(fs.readFileSync(output, 'utf8'))
  : { run, base, cases: [], rejections: [], retry: null };
assert.equal(report.base, base, 'Resume must use the original backend');
delete report.failure;
report.complete = false;
const repository = path.resolve(__dirname, '..');
const fixture = (name) => fs.readFileSync(path.join(repository, 'apps/backend/test/fixtures', name));

async function request(route, options) {
  const response = await fetch(new URL(`/api/${route}`, base), {
    ...options, signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json();
  return { http: response.status, body, data: body.data };
}
const json = (route, body) => request(route, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
async function upload(kb, name, bytes, type) {
  const form = new FormData();
  form.set('workspaceId', workspaceId);
  form.set('file', new Blob([bytes], { type }), name);
  return request(`knowledge-bases/${kb}/documents/files?workspaceId=${workspaceId}`, { method: 'POST', body: form });
}
async function waitForDocument(id) {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const result = await request(`documents/${id}?workspaceId=${workspaceId}`);
    assert.equal(result.http, 200);
    if (result.data.status !== 'PROCESSING') return result.data;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for document ${id}`);
}
function save() {
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}

(async () => {
  const cases = [
    { name: 'TEXT', type: 'TEXT', text: 'Text document acceptance. Travel reimbursement requires an invoice.' },
    { name: 'acceptance.txt', type: 'TXT', bytes: Buffer.from('TXT acceptance. Travel reimbursement requires an invoice.') },
    { name: 'acceptance.json', type: 'JSON', bytes: Buffer.from(JSON.stringify({ policy: 'JSON acceptance. Travel reimbursement requires an invoice.' })) },
    { name: 'acceptance.md', type: 'MARKDOWN', bytes: Buffer.from('# Markdown acceptance\n\nTravel reimbursement requires an invoice.\n\n- Submit receipts.') },
    { name: 'acceptance.html', type: 'HTML', bytes: Buffer.from('<main><h1>HTML acceptance</h1><p>Travel reimbursement requires an invoice.</p></main><footer>DROP_THIS_FOOTER</footer>') },
    { name: 'native.pdf', type: 'PDF', bytes: fixture('pdf-detach-regression.pdf'), mime: 'application/pdf' },
    { name: 'acceptance-scan.pdf', type: 'PDF', ocr: true, mime: 'application/pdf' },
    { name: 'acceptance.png', type: 'IMAGE', ocr: true, mime: 'image/png' },
    { name: 'acceptance.jpg', type: 'IMAGE', ocr: true, mime: 'image/jpeg' },
    { name: 'acceptance.docx', type: 'DOCX', bytes: fixture('t8.docx') },
    { name: 'acceptance.pptx', type: 'PPTX', bytes: fixture('t8.pptx') },
  ];
  for (const item of cases) {
    if (report.cases.some((result) => result.name === item.name && result.retrieval === 'HIT')) continue;
    const kb = await json('knowledge-bases', { workspaceId, name: `Parsing ${run} ${item.type} ${report.cases.length}`, description: 'Isolated upload acceptance' });
    assert.equal(kb.http, 200);
    const kbId = kb.data.id;
    const bytes = item.text ? null : item.bytes ?? fs.readFileSync(path.join(fixtures, item.name));
    const created = item.text
      ? await json(`knowledge-bases/${kbId}/documents/text`, { workspaceId, title: `TEXT ${run}`, text: item.text })
      : await upload(kbId, item.name, bytes, item.mime ?? 'application/octet-stream');
    assert.equal(created.http, 202, JSON.stringify(created.body));
    const result = { name: item.name, sourceType: item.type, knowledgeBaseId: kbId, documentId: created.data.id, bytes: bytes?.length, uploadHttp: created.http };
    report.cases.push(result); save();
    console.log(`Accepted ${item.name}; waiting for real parser/OCR/embedding`);
    const ready = await waitForDocument(created.data.id);
    Object.assign(result, { status: ready.status, error: ready.error, chunkCount: ready.chunkCount }); save();
    assert.equal(ready.status, 'READY', JSON.stringify(ready));
    assert.equal(ready.sourceType, item.type);
    const content = await request(`documents/${ready.id}/content?workspaceId=${workspaceId}`);
    const rawText = content.data.content;
    assert(rawText.trim().length > 0);
    if (item.ocr) assert.match(rawText, /MINICOZE|reimbursement|invoice/i);
    if (item.type === 'HTML') assert(!rawText.includes('DROP_THIS_FOOTER'));
    const chunks = await request(`knowledge-bases/${kbId}/documents/${ready.id}/chunks?workspaceId=${workspaceId}`);
    assert.equal(chunks.http, 200);
    assert.equal(chunks.data.total, ready.chunkCount);
    assert(chunks.data.items.length > 0);
    for (const chunk of chunks.data.items) {
      assert.equal(rawText.slice(chunk.startOffset, chunk.endOffset), chunk.content);
    }
    if (item.type === 'DOCX' || item.type === 'PPTX') {
      assert(chunks.data.items.some((chunk) => chunk.sourceRanges?.ranges.length > 0));
      if (item.type === 'PPTX') assert(chunks.data.items.some((chunk) => chunk.sourceRanges?.ranges.some((range) => range.slideNumber > 0)));
    }
    const search = await json(`knowledge-bases/${kbId}/retrieval-preview`, { workspaceId, query: rawText.slice(0, 100) });
    assert.equal(search.http, 200, JSON.stringify(search.body));
    assert.equal(search.data.status, 'HIT');
    assert(search.data.hits.some((hit) => hit.documentId === ready.id));
    Object.assign(result, { rawTextLength: rawText.length, checkedChunks: chunks.data.items.length, retrieval: search.data.status, sourceRanges: chunks.data.items.filter((chunk) => chunk.sourceRanges).length });
    save(); console.log(`PASS ${item.name}: READY, ${ready.chunkCount} chunks, retrieval HIT`);
  }
  const kb = report.cases[0].knowledgeBaseId;
  const list = () => request(`knowledge-bases/${kb}/documents?workspaceId=${workspaceId}`);
  const before = (await list()).data.length;
  const rejected = [
    ['bad.gif', Buffer.from('GIF89a'), 'image/gif', 400],
    ['bad.png', Buffer.from('not png'), 'image/png', 400],
    ['bad.docx', Buffer.from('not a zip'), 'application/octet-stream', 400],
    ['large.txt', Buffer.alloc(1024 * 1024 + 1, 97), 'text/plain', 400],
    ['large.png', Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png', 413],
    ['large.docx', Buffer.alloc(32 * 1024 * 1024 + 1), 'application/octet-stream', 413],
  ];
  for (const [name, bytes, mime, expected] of rejected) {
    const result = await upload(kb, name, bytes, mime);
    report.rejections.push({ name, http: result.http, expected }); save();
    assert.equal(result.http, expected, JSON.stringify(result.body));
  }
  assert.equal((await list()).data.length, before, 'Rejected uploads must not create documents');
  const invalid = await upload(kb, 'invalid.pdf', Buffer.from('not a PDF'), 'application/pdf');
  assert.equal(invalid.http, 202);
  const failed = await waitForDocument(invalid.data.id);
  assert.equal(failed.status, 'FAILED');
  const retry = await json(`documents/${invalid.data.id}/retry`, { workspaceId });
  assert.equal(retry.http, 202);
  const retried = await waitForDocument(invalid.data.id);
  assert.equal(retried.status, 'FAILED');
  const failedChunks = await request(`knowledge-bases/${kb}/documents/${invalid.data.id}/chunks?workspaceId=${workspaceId}`);
  assert.equal(failedChunks.data.total, 0);
  report.retry = { documentId: invalid.data.id, firstError: failed.error, retryHttp: retry.http, finalError: retried.error, chunks: failedChunks.data.total };
  report.complete = true; save();
  console.log('PASS rejection/no-partial-record and retry/no-partial-chunk checks');
})().catch((error) => {
  report.complete = false; report.failure = error.message; save();
  console.error(error.message); process.exitCode = 1;
});
