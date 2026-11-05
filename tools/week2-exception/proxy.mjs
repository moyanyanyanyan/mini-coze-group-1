import http from 'node:http';
import { StringDecoder } from 'node:string_decoder';
import { URL } from 'node:url';

const token = process.env.TEST_CONTROL_TOKEN;
if (!token || token.length < 20) throw new Error('TEST_CONTROL_TOKEN must contain at least 20 characters');

function port(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`Invalid ${name}`);
  return value;
}

function target(name, fallback) {
  const url = new URL(process.env[name] ?? fallback);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be a plain loopback HTTP origin`);
  }
  return url;
}

const agentPort = port('TEST_AGENT_PROXY_PORT', 8111);
const backendPort = port('TEST_BACKEND_PROXY_PORT', 3111);
const controlPort = port('TEST_CONTROL_PORT', 9111);
const agent = target('TEST_AGENT_TARGET', 'http://127.0.0.1:8011');
const backend = target('TEST_BACKEND_TARGET', 'http://127.0.0.1:3011');
const ports = [agentPort, backendPort, controlPort];
if (new Set(ports).size !== ports.length || ports.includes(Number(agent.port)) || ports.includes(Number(backend.port)) ||
    agent.origin === backend.origin) throw new Error('Proxy, control and target addresses must be distinct');

const state = {
  embeddingFault: false,
  retrievalHold: false,
  pending: null,
  embeddingFaultCount: 0,
  retrievalCount: 0,
  retrievalStatus: null,
  runtimeEvents: [],
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function snapshot() {
  return {
    agentTarget: agent.origin,
    backendTarget: backend.origin,
    embeddingFault: state.embeddingFault,
    retrievalHold: state.retrievalHold,
    pendingRetrieval: Boolean(state.pending),
    embeddingFaultCount: state.embeddingFaultCount,
    retrievalCount: state.retrievalCount,
    retrievalStatus: state.retrievalStatus,
    runtimeEvents: state.runtimeEvents,
  };
}

function observeSse(response) {
  let buffer = '';
  const decoder = new StringDecoder('utf8');
  response.on('data', (chunk) => {
    buffer += decoder.write(chunk);
    if (buffer.length > 100_000) buffer = buffer.slice(-16_000);
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const line = frame.split('\n').find((value) => value.startsWith('data:'));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(5));
        if (typeof event.type === 'string') {
          state.runtimeEvents.push({ type: event.type, ...(event.type === 'run.failed' ? { code: event.data?.code } : {}) });
          if (state.runtimeEvents.length > 100) state.runtimeEvents.shift();
        }
      } catch { /* only event type and failure code are recorded */ }
    }
  });
}

function forward(req, res, destination, kind) {
  const url = new URL(req.url ?? '/', destination);
  const upstream = http.request(url, {
    method: req.method,
    headers: { ...req.headers, host: destination.host },
  }, (upstreamResponse) => {
    if (kind === 'retrieval') state.retrievalStatus = upstreamResponse.statusCode ?? null;
    if (kind === 'runtime') observeSse(upstreamResponse);
    res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on('error', () => {
    if (kind === 'retrieval') state.retrievalStatus = 502;
    if (!res.headersSent) json(res, 502, { error: 'test proxy upstream unavailable' });
    else res.destroy();
  });
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

function makeProxy(destination, side) {
  return http.createServer((req, res) => {
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return json(res, 400, { error: 'relative path required' });
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (side === 'agent' && req.method === 'POST' && path === '/internal/knowledge/embeddings' && state.embeddingFault) {
      state.embeddingFaultCount += 1;
      req.resume();
      return json(res, 503, { detail: 'test-only embedding failure' });
    }
    if (side === 'backend' && req.method === 'POST' && path === '/internal/knowledge/retrieval') {
      state.retrievalCount += 1;
      if (state.retrievalHold) {
        if (state.pending) return json(res, 409, { error: 'one held retrieval is already pending' });
        const timer = setTimeout(() => {
          if (state.pending?.req === req) state.pending = null;
          state.retrievalStatus = 504;
          json(res, 504, { code: 504, message: 'test gate expired', data: null });
        }, 7_000);
        state.pending = { req, res, timer };
        res.on('close', () => {
          clearTimeout(timer);
          if (state.pending?.req === req) state.pending = null;
        });
        return;
      }
      return forward(req, res, destination, 'retrieval');
    }
    return forward(req, res, destination, side === 'agent' && req.method === 'POST' && path === '/internal/runtime/stream' ? 'runtime' : 'other');
  });
}

const control = http.createServer((req, res) => {
  if (req.headers['x-test-control-token'] !== token) return json(res, 403, { error: 'forbidden' });
  if (!req.url?.startsWith('/') || req.url.startsWith('//')) return json(res, 400, { error: 'relative path required' });
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method === 'GET' && path === '/state') return json(res, 200, snapshot());
  if (req.method === 'POST' && path === '/arm-embedding') {
    if (state.pending) return json(res, 409, { error: 'pending retrieval' });
    state.embeddingFault = true;
    state.retrievalHold = false;
    state.embeddingFaultCount = 0;
    state.retrievalCount = 0;
    state.retrievalStatus = null;
    state.runtimeEvents = [];
    return json(res, 200, snapshot());
  }
  if (req.method === 'POST' && path === '/arm-unbind') {
    if (state.pending) return json(res, 409, { error: 'pending retrieval' });
    state.embeddingFault = false;
    state.retrievalHold = true;
    state.embeddingFaultCount = 0;
    state.retrievalCount = 0;
    state.retrievalStatus = null;
    state.runtimeEvents = [];
    return json(res, 200, snapshot());
  }
  if (req.method === 'POST' && path === '/release') {
    const held = state.pending;
    if (!held) return json(res, 409, { error: 'no held retrieval' });
    state.pending = null;
    state.retrievalHold = false;
    clearTimeout(held.timer);
    forward(held.req, held.res, backend, 'retrieval');
    return json(res, 200, snapshot());
  }
  if (req.method === 'POST' && path === '/reset') {
    state.embeddingFault = false;
    state.retrievalHold = false;
    if (state.pending) {
      const held = state.pending;
      state.pending = null;
      clearTimeout(held.timer);
      state.retrievalStatus = 504;
      json(held.res, 504, { code: 504, message: 'test gate reset', data: null });
    }
    return json(res, 200, snapshot());
  }
  json(res, 404, { error: 'unknown control action' });
});

const servers = [
  [makeProxy(agent, 'agent'), agentPort, 'agent'],
  [makeProxy(backend, 'backend'), backendPort, 'backend'],
  [control, controlPort, 'control'],
];
for (const [server, listenPort, name] of servers) {
  server.listen(listenPort, '127.0.0.1', () => {
    process.stdout.write(`${name} proxy listening on 127.0.0.1:${listenPort}\n`);
  });
}
