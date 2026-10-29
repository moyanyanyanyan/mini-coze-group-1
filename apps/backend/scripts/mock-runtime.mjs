// 本地假 Runtime：不依赖王一恒，先把 C1/C2/C3 跑通。
// 启动：node scripts/mock-runtime.mjs
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_RUNTIME_PORT ?? 9999);
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token';
// 每个 SSE 帧按 N 字节切片写出，用来复现「UTF-8 汉字被切半」。0 = 关闭
const SPLIT = Number(process.env.MOCK_BYTE_SPLIT ?? 0);
// 每个 delta 前插一条心跳，用来验证 C1 会不会过滤注释行
const HEARTBEAT = process.env.MOCK_HEARTBEAT === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

/** 把王一恒 schemas.py 里的校验搬过来。C2 组装错了这里立刻报 400，等于提前替你联调 */
function validate(body) {
  const need = ['runId', 'actor', 'conversationId', 'userMessageId', 'assistantMessageId', 'agentConfig', 'history', 'message'];
  for (const key of need) if (body[key] === undefined) return `缺少字段 ${key}`;
  if (!String(body.message ?? '').trim()) return 'message 不能为空';
  if (body.userMessageId === body.assistantMessageId) return 'userMessageId 与 assistantMessageId 不能相同';

  const history = body.history;
  if (history.length % 2 !== 0) return `history 必须是完整问答对，当前 ${history.length} 条（奇数）`;
  for (let i = 0; i < history.length; i += 1) {
    if (history[i].role !== (i % 2 === 0 ? 'user' : 'assistant')) {
      return `history 第 ${i} 条 role 应为 ${i % 2 === 0 ? 'user' : 'assistant'}，实际 ${history[i].role}`;
    }
  }
  const ids = history.map((h) => h.id);
  if (new Set(ids).size !== ids.length) return 'history 里消息 id 重复';
  if (ids.includes(body.userMessageId) || ids.includes(body.assistantMessageId)) {
    return 'history 不能包含本轮消息';
  }
  return null;
}

/** 和他的 event() 完全同构：扁平信封 + id/event/data 三行 */
function envelope(req, seq, type, data) {
  return {
    runId: req.runId,
    conversationId: req.conversationId,
    seq,
    timestamp: new Date().toISOString(),
    type,
    data,
  };
}

async function writeFrame(res, env) {
  const text = `id: ${env.runId}:${env.seq}\nevent: ${env.type}\ndata: ${JSON.stringify(env)}\n\n`;
  if (!SPLIT) {
    res.write(text);
    return;
  }
  // 按字节切：汉字会被切在半个 UTF-8 序列上，专门用来打 C1 的解码
  const buf = Buffer.from(text, 'utf8');
  for (let i = 0; i < buf.length; i += SPLIT) {
    res.write(buf.subarray(i, i + SPLIT));
    await sleep(5);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/internal/runtime/stream') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ statusCode: 404, message: 'not found', path: url.pathname }));
    return;
  }

  if ((req.headers.authorization ?? '') !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'content-type': 'application/json', 'x-runtime-error-code': 'INTERNAL_UNAUTHORIZED' });
    res.end(JSON.stringify({ statusCode: 401, message: '内部服务凭证无效', path: url.pathname }));
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json', 'x-runtime-error-code': 'INVALID_REQUEST' });
    res.end(JSON.stringify({ statusCode: 400, message: '请求体不是合法 JSON' }));
    return;
  }

  const problem = validate(body);
  if (problem) {
    res.writeHead(400, { 'content-type': 'application/json', 'x-runtime-error-code': 'INVALID_REQUEST' });
    res.end(JSON.stringify({ statusCode: 400, message: `请求字段、历史顺序或参数不合法：${problem}` }));
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    'x-accel-buffering': 'no',
  });

  let seq = 0;
  let stopped = false;
  req.on('close', () => { stopped = true; });   // C4 中断：前端一断这里就停

  try {
    await writeFrame(res, envelope(body, ++seq, 'run.started', { assistantMessageId: body.assistantMessageId }));

    if (String(body.message).includes('失败')) {
      await sleep(200);
      await writeFrame(res, envelope(body, ++seq, 'run.failed', {
        code: 'MOCK_FORCED_FAILURE', message: '你在消息里写了「失败」，Mock 故意失败', retryable: true,
      }));
      res.end();
      return;
    }

    const full = `【Mock Runtime】你刚才说：「${body.message}」。这是本地假流式回复，用来验证 C1 解析、C2 落库、C3 转发。王一恒真起来后，把 AGENT_SERVICE_URL 改成 8000 就切走了。`;
    const chunks = full.match(/.{1,6}/gs) ?? [];

    for (const chunk of chunks) {
      if (stopped) break;
      await sleep(60);
      if (HEARTBEAT) res.write(': heartbeat\n\n');
      await writeFrame(res, envelope(body, ++seq, 'message.delta', { content: chunk }));
    }

    if (!stopped) {
      await writeFrame(res, envelope(body, ++seq, 'run.completed', {
        runId: body.runId,
        conversationId: body.conversationId,
        assistantMessageId: body.assistantMessageId,
        status: 'completed',
        content: full,
        finishReason: 'stop',
        usage: { promptTokens: 12, completionTokens: chunks.length, totalTokens: 12 + chunks.length },
        citations: [],
        toolResults: [],
      }));
    }
  } finally {
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`mock runtime: http://localhost:${PORT}/internal/runtime/stream`);
  console.log(`token=${TOKEN}  split=${SPLIT}  heartbeat=${HEARTBEAT}`);
});
