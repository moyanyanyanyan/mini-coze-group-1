import assert from 'node:assert/strict';

const [agentId, question, expectedStatus, expectedSourcesText] = process.argv.slice(2);
const email = process.env.RAG_TEST_EMAIL;
const password = process.env.RAG_TEST_PASSWORD;
const baseUrl = (process.env.RAG_TEST_API_BASE_URL ?? 'http://localhost:3000/api/').replace(/\/?$/, '/');

if (!email || !password || !agentId || !question || !expectedStatus || expectedSourcesText === undefined) {
  throw new Error('需要 RAG_TEST_EMAIL/PASSWORD 和参数：agentId question matched|no_match expectedSourceCount');
}

const expectedSources = Number(expectedSourcesText);
assert.ok(Number.isInteger(expectedSources) && expectedSources >= 0);

const login = await fetch(`${baseUrl}auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
assert.equal(login.status, 200, `登录失败：${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
assert.ok(cookie, '登录未返回会话 Cookie');

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) throw new Error(`${path} 返回 ${response.status}: ${await response.text()}`);
  return response.json();
}

const conversation = await api('conversations', {
  method: 'POST', body: JSON.stringify({ agentId }),
});
assert.equal(conversation.agentId, agentId);

const stream = await fetch(`${baseUrl}conversations/${conversation.id}/messages/stream`, {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  body: JSON.stringify({ content: question }),
});
if (stream.status !== 200) throw new Error(`聊天流返回 ${stream.status}: ${await stream.text()}`);
assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);

const raw = await stream.text();
const events = raw.split(/\r?\n\r?\n/).map((frame) => {
  const data = frame.split(/\r?\n/).find((line) => line.startsWith('data:'));
  return data ? JSON.parse(data.slice(5).trim()) : null;
}).filter(Boolean);

assert.equal(events[0]?.type, 'run.started');
assert.equal(events.at(-1)?.type, 'run.completed', `终态不是完成：${JSON.stringify(events.at(-1))}`);
assert.equal(events.filter((event) => event.type === 'run.completed' || event.type === 'run.failed').length, 1);
assert.deepEqual(events.map((event) => event.seq), events.map((_, index) => index + 1));

const knowledge = events.find((event) => event.type === 'knowledge.result');
assert.ok(knowledge, '未收到 knowledge.result');
assert.equal(knowledge.data.status, expectedStatus);
assert.equal(knowledge.data.citations?.length, expectedSources);
assert.deepEqual(Object.keys(knowledge.data).sort(), ['citations', 'status']);
for (const source of knowledge.data.citations) {
  assert.deepEqual(Object.keys(source).sort().filter((key) => ['content', 'score', 'chunks'].includes(key)), []);
}

const completed = events.at(-1);
const joinedDeltas = events.filter((event) => event.type === 'message.delta')
  .map((event) => String(event.data.content ?? '')).join('');
assert.equal(joinedDeltas, completed.data.content);
const messages = await api(`conversations/${conversation.id}/messages`);
const saved = messages.find((message) => message.id === completed.data.assistantMessageId);
assert.equal(saved?.status, 'completed');
assert.equal(saved?.content, completed.data.content);

console.log(JSON.stringify({
  conversationId: conversation.id, runId: completed.runId,
  eventCount: events.length, status: knowledge.data.status,
  sources: knowledge.data.citations.map((source) => source.title),
  content: completed.data.content,
}, null, 2));
