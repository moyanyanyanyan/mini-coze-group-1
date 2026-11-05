import assert from 'node:assert/strict';

const scenario = process.argv[2];
if (!['embedding', 'unbind'].includes(scenario)) throw new Error('Usage: node run.mjs embedding|unbind');

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const email = required('RAG_TEST_EMAIL');
const password = required('RAG_TEST_PASSWORD');
const agentId = required('TEST_AGENT_ID');
const knowledgeBaseId = required('TEST_KB_ID');
const expectedActorId = required('TEST_EXPECTED_ACTOR_ID');
const controlToken = required('TEST_CONTROL_TOKEN');
const backendPort = Number(process.env.TEST_BACKEND_TARGET_PORT ?? 3011);
const controlPort = Number(process.env.TEST_CONTROL_PORT ?? 9111);
const backend = `http://127.0.0.1:${backendPort}/api/`;
const control = `http://127.0.0.1:${controlPort}`;
const question = process.env.TEST_QUESTION ?? '工作日午餐报销上限是多少？';

// The runner must be launched with the same isolated DB URL used for the backend.
// A separate NestJS process cannot prove its own DATABASE_URL through its public API.
const dbUrl = new URL(required('DATABASE_URL'));
assert.ok(['postgresql:', 'postgres:'].includes(dbUrl.protocol), 'DATABASE_URL must use PostgreSQL');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'DATABASE_URL must be local');
assert.equal(dbUrl.pathname, '/minicoze_rag_integration', 'Only the isolated integration DB is permitted');
assert.ok(Number.isInteger(backendPort) && backendPort >= 1024 && backendPort <= 65535);
assert.ok(Number.isInteger(controlPort) && controlPort >= 1024 && controlPort <= 65535);

async function controlCall(path, method = 'GET') {
  const response = await fetch(control + path, {
    method, headers: { 'x-test-control-token': controlToken }, signal: AbortSignal.timeout(3_000),
  });
  assert.equal(response.status, 200, `Proxy control ${path} returned ${response.status}`);
  return response.json();
}

async function api(path, cookie, method = 'GET', body, timeoutMs = 15_000) {
  const response = await fetch(backend + path, {
    method,
    headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert.ok(response.ok, `${method} ${path} returned ${response.status}`);
  const value = await response.json();
  return value?.code && 'data' in value ? value.data : value;
}

function parseEvents(raw) {
  return raw.split(/\r?\n\r?\n/).flatMap((frame) => {
    const line = frame.split(/\r?\n/).find((part) => part.startsWith('data:'));
    if (!line) return [];
    try { return [JSON.parse(line.slice(5).trim())]; } catch { return []; }
  });
}

async function waitForHeldRetrieval() {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const current = await controlCall('/state');
    if (current.pendingRetrieval) return current;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error('Runtime retrieval did not reach the hold gate within four seconds');
}

let cookie = '';
let originalBindings = null;
let bindingWriteAttempted = false;
let streamAbort;
let streamText;
let releaseSucceeded = false;
let report = null;
let stage = 'preflight';
try {
  const health = await fetch(backend + 'health', { signal: AbortSignal.timeout(2_000) });
  assert.equal(health.status, 200, 'Isolated NestJS health check failed');
  const initial = await controlCall('/state');
  assert.equal(initial.backendTarget, `http://127.0.0.1:${backendPort}`, 'Proxy targets a different NestJS instance');
  assert.equal(initial.agentTarget, process.env.TEST_AGENT_TARGET ?? 'http://127.0.0.1:8011', 'Proxy targets a different Runtime instance');
  assert.equal(initial.embeddingFault, false, 'Proxy already has an active Embedding fault');
  assert.equal(initial.retrievalHold, false, 'Proxy already has an active retrieval gate');
  assert.equal(initial.pendingRetrieval, false, 'Proxy already has a pending request');

  stage = 'login';
  const login = await fetch(backend + 'auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15_000),
  });
  assert.equal(login.status, 200, `Login returned ${login.status}`);
  cookie = login.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  assert.ok(cookie, 'Login returned no session cookie');
  const actor = await api('auth/me', cookie);
  assert.equal(actor.id, expectedActorId, 'Logged-in actor differs from the isolated fixture');

  stage = 'check-bindings';
  const bindings = await api(`agents/${agentId}/knowledge-bases`, cookie);
  assert.ok(Array.isArray(bindings), 'Agent binding response is not an array');
  assert.equal(bindings.length, 1, 'This runner requires a single-KB Agent');
  assert.equal(bindings[0].knowledgeBaseId, knowledgeBaseId, 'Agent binding differs from the isolated fixture');
  assert.equal(bindings[0].enabled, true, 'Test binding is not enabled');
  originalBindings = bindings.map(({ knowledgeBaseId, enabled, config }) => ({ knowledgeBaseId, enabled, ...(config ? { config } : {}) }));

  const bases = await api(`knowledge-bases?workspaceId=${encodeURIComponent(expectedActorId)}`, cookie);
  assert.ok(Array.isArray(bases) && bases.some((base) => base.id === knowledgeBaseId && base.status === 'ACTIVE'),
    'Test knowledge base is not ACTIVE in this account');
  stage = 'check-ready-documents';
  const documents = await api(`knowledge-bases/${knowledgeBaseId}/documents?workspaceId=${encodeURIComponent(expectedActorId)}`, cookie);
  assert.ok(Array.isArray(documents) && documents.some((document) => document.status === 'READY' && document.chunkCount > 0),
    'Test knowledge base has no READY document with chunks');
  // This is a safe, unpaid preflight using the real local Embedding service.
  stage = 'verify-real-retrieval-before-fault';
  const preview = await api(`knowledge-bases/${knowledgeBaseId}/retrieval-preview`, cookie, 'POST',
    { workspaceId: expectedActorId, query: question }, 130_000);
  assert.equal(preview.status, 'HIT', 'Knowledge preflight must HIT before fault injection');
  assert.ok(preview.hits?.some((hit) => hit.knowledgeBaseId === knowledgeBaseId), 'Knowledge preflight returned no expected hit');

  stage = 'arm-test-fault';
  await controlCall(scenario === 'embedding' ? '/arm-embedding' : '/arm-unbind', 'POST');
  stage = 'public-chat';
  const conversation = await api('conversations', cookie, 'POST', { agentId });
  streamAbort = new AbortController();
  const streamResponse = await fetch(backend + `conversations/${conversation.id}/messages/stream`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content: question }), signal: streamAbort.signal,
  });
  assert.equal(streamResponse.status, 200, `Public chat returned ${streamResponse.status}`);
  assert.match(streamResponse.headers.get('content-type') ?? '', /text\/event-stream/);
  streamText = streamResponse.text();
  // Keep the promise handled while the unbind gate is being coordinated.
  streamText.catch(() => {});

  if (scenario === 'unbind') {
    stage = 'wait-for-held-retrieval';
    const held = await waitForHeldRetrieval();
    assert.ok(held.runtimeEvents.some((event) => event.type === 'run.started'), 'Runtime did not announce run.started before gate');
    bindingWriteAttempted = true;
    await api(`agents/${agentId}/knowledge-bases`, cookie, 'PUT', { bindings: [] });
    const changed = await api(`agents/${agentId}/knowledge-bases`, cookie);
    assert.equal(changed.length, 0, 'Unbind was not visible before releasing retrieval');
    await controlCall('/release', 'POST');
    releaseSucceeded = true;
  }

  stage = 'read-public-sse';
  const events = parseEvents(await Promise.race([
    streamText,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Public chat stream did not finish within 15 seconds')), 15_000)),
  ]));
  const state = await controlCall('/state');
  const terminals = events.filter((event) => ['run.completed', 'run.failed'].includes(event.type));
  const start = events.find((event) => event.type === 'run.started');
  const failed = terminals[0];
  assert.ok(start, 'No public run.started event');
  assert.equal(terminals.length, 1, 'Expected exactly one terminal event');
  assert.equal(failed.type, 'run.failed', 'Failure incorrectly completed');
  assert.equal(events.some((event) => event.type === 'knowledge.result'), false, 'Failure incorrectly announced knowledge.result');
  assert.equal(events.some((event) => event.type === 'run.completed'), false, 'Failure incorrectly announced run.completed');
  assert.equal(state.retrievalStatus, scenario === 'embedding' ? 503 : 403, 'Unexpected NestJS retrieval status');
  assert.equal(state.embeddingFaultCount, scenario === 'embedding' ? 1 : 0, 'Unexpected Embedding fault count');
  assert.ok(state.runtimeEvents.some((event) => event.type === 'run.failed' &&
    event.code === (scenario === 'embedding' ? 'KNOWLEDGE_UNAVAILABLE' : 'KNOWLEDGE_FORBIDDEN')),
    'Runtime did not emit the expected internal failure code');
  assert.equal(failed.data.code, 'MODEL_ERROR', 'Unexpected projected public error code');

  stage = 'verify-saved-messages';
  const messages = await api(`conversations/${conversation.id}/messages`, cookie);
  const assistant = messages.find((message) => message.id === start.data.assistantMessageId);
  assert.equal(assistant?.status, 'failed', 'Assistant message was not saved as failed');
  assert.equal(assistant?.content, '', 'Assistant message contains unexpected generated text');

  report = {
    scenario, conversationId: conversation.id, runId: start.runId,
    knowledgeBaseId, agentId, unbindReleased: scenario === 'unbind' ? releaseSucceeded : undefined,
    layers: {
      embeddingFaultCount: state.embeddingFaultCount,
      knowledgeRetrievalHttpStatus: state.retrievalStatus,
      runtimeEvents: state.runtimeEvents,
      publicEvents: events.map((event) => ({ type: event.type, ...(event.type === 'run.failed' ? { code: event.data.code } : {}) })),
      assistantMessageStatus: assistant.status,
    },
  };
} catch (error) {
  process.stderr.write(`FAIL ${scenario} at ${stage}: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
} finally {
  streamAbort?.abort();
  try { await controlCall('/reset', 'POST'); }
  catch { process.stderr.write('RECOVERY NEEDED: proxy reset failed\n'); process.exitCode = 1; }
  if (bindingWriteAttempted && cookie && originalBindings) {
    try {
      await api(`agents/${agentId}/knowledge-bases`, cookie, 'PUT', { bindings: originalBindings });
      const restored = await api(`agents/${agentId}/knowledge-bases`, cookie);
      assert.deepEqual(restored.map(({ knowledgeBaseId, enabled }) => ({ knowledgeBaseId, enabled })),
        originalBindings.map(({ knowledgeBaseId, enabled }) => ({ knowledgeBaseId, enabled })));
      process.stdout.write('RECOVERED original Agent binding\n');
    } catch {
      process.stderr.write('RECOVERY NEEDED: original Agent binding was not confirmed restored\n');
      process.exitCode = 1;
    }
  }
  if (!process.exitCode && report) process.stdout.write(JSON.stringify({ result: 'PASS', ...report, environmentRestored: true }, null, 2) + '\n');
}
