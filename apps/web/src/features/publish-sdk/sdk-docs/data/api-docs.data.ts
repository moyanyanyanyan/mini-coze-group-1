/** Static content used by the SDK documentation page. */
export interface DocSection {
  id: string;
  label: string;
}

export interface CodeSample {
  id: string;
  label: string;
  language: string;
  code: string;
}

export interface ParameterRow {
  name: string;
  type: string;
  description: string;
}

export interface EventRow {
  name: string;
  description: string;
  data: string;
}

export interface EndpointRow {
  name: string;
  method: string;
  path: string;
  description: string;
}

export interface StatusRow {
  status: string;
  meaning: string;
  note: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface RuntimeErrorRow {
  code: string;
  httpStatus: number;
}

export const API_DOC_SECTIONS: readonly DocSection[] = [
  { id: 'quick-start', label: '快速开始' },
  { id: 'integration-choice', label: '接入方式选择' },
  { id: 'run-sync', label: 'Run 普通调用' },
  { id: 'stream', label: 'Stream 流式调用' },
  { id: 'example-project', label: '可运行示例' },
  { id: 'api-reference', label: 'API 参考' },
  { id: 'errors-faq', label: '错误与常见问题' },
];

/* ------------------------------------------------------------------ */
/* 快速开始                                                            */
/* ------------------------------------------------------------------ */

export const SDK_INSTALL_SAMPLE: CodeSample = {
  id: 'sdk-install',
  label: '安装 SDK',
  language: 'bash',
  code: 'npm install @minicoze/sdk',
};

export const SDK_INSTALL_FALLBACK_SAMPLE: CodeSample = {
  id: 'sdk-install-fallback',
  label: '本地 tarball 安装',
  language: 'bash',
  code: 'npm install https://github.com/moyanyanyanyan/mini-coze-group-1/releases/download/v0.1.0/minicoze-sdk-0.1.0.tgz',
};

export const ENV_SAMPLE: CodeSample = {
  id: 'env',
  label: '环境变量',
  language: 'bash',
  code: `# .env —— 只放在服务端，不要提交到 Git
MINICOZE_BASE_URL=https://your-minicoze-host
MINICOZE_API_KEY=mk_live_在这里填入你的Key`,
};

export const SDK_INIT_SAMPLE: CodeSample = {
  id: 'sdk-init',
  label: '初始化客户端',
  language: 'typescript',
  code: `import { MiniCozeClient } from '@minicoze/sdk';

const baseURL = process.env.MINICOZE_BASE_URL;
const apiKey = process.env.MINICOZE_API_KEY;

if (!baseURL || !apiKey) {
  throw new Error('缺少 MINICOZE_BASE_URL 或 MINICOZE_API_KEY 环境变量');
}

const client = new MiniCozeClient({
  baseURL,           // 必填：MiniCoze 服务地址，必须以 http/https 开头
  apiKey,            // 必填：Bearer 鉴权用的 API Key
  timeoutMs: 30_000, // 可选：默认 30000ms
});`,
};

export const FIRST_RUN_SAMPLE: CodeSample = {
  id: 'first-run',
  label: '第一次调用',
  language: 'typescript',
  code: `import { MiniCozeClient } from '@minicoze/sdk';

const client = new MiniCozeClient({
  baseURL: process.env.MINICOZE_BASE_URL ?? '',
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});

const result = await client.run({
  message: '你好，介绍一下你自己',
});

// run() 直接返回 RunResult，不需要再拆 code/message/data 信封
console.log(result.content);        // Agent 的完整回答
console.log(result.conversationId); // 下次续聊时传给 conversationId
console.log(result.runId);          // 本次运行 ID，排查问题时用`,
};

export const SDK_ERROR_SAMPLE: CodeSample = {
  id: 'sdk-error',
  label: '异常处理',
  language: 'typescript',
  code: `import {
  MiniCozeAbortError,
  MiniCozeHTTPError,
  MiniCozeNetworkError,
  MiniCozeTimeoutError,
} from '@minicoze/sdk';

try {
  const result = await client.run({ message: '你好' });
  console.log(result.content);
} catch (error) {
  if (error instanceof MiniCozeHTTPError) {
    // 服务端已返回 HTTP 错误，例如 401 Key 无效、403 Agent 不可调用
    console.error('HTTP', error.httpStatus, error.errorCode ?? '', error.message);
  } else if (error instanceof MiniCozeTimeoutError) {
    console.error('超过 ' + error.timeoutMs + 'ms 未完成');
  } else if (error instanceof MiniCozeAbortError) {
    console.error('请求已取消');
  } else if (error instanceof MiniCozeNetworkError) {
    console.error('网络不可用', error.message);
  } else {
    throw error;
  }
}`,
};

/* ------------------------------------------------------------------ */
/* Run / Stream                                                        */
/* ------------------------------------------------------------------ */

const curlRunCode = [
  'curl -X POST "${BASE_URL}/api/v1/run" \\',
  '  -H "Authorization: Bearer ${API_KEY}" \\',
  '  -H "Content-Type: application/json" \\',
  `  -d '{`,
  '    "message": "你好"',
  `  }'`,
].join('\n');

const typescriptRunCode = `import { MiniCozeClient } from '@minicoze/sdk';

const client = new MiniCozeClient({
  baseURL: process.env.MINICOZE_BASE_URL ?? '',
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});

const result = await client.run({
  message: '你好',
});

console.log(result.content);
console.log(result.conversationId);`;

export const QUICK_START_SAMPLES: readonly CodeSample[] = [
  {
    id: 'sdk',
    label: 'TypeScript SDK（推荐）',
    language: 'typescript',
    code: typescriptRunCode,
  },
  {
    id: 'curl',
    label: 'curl',
    language: 'bash',
    code: curlRunCode,
  },
];

export const RUN_REQUEST_SAMPLE: CodeSample = {
  id: 'run-request',
  label: 'Run 请求示例',
  language: 'bash',
  code: curlRunCode,
};

export const RUN_RESPONSE_SAMPLE: CodeSample = {
  id: 'run-response',
  label: 'Run 成功响应示例',
  language: 'json',
  code: `{
  "code": 200,
  "message": "ok",
  "data": {
    "runId": "run_example",
    "conversationId": "conversation_example",
    "assistantMessageId": "assistant_message_example",
    "status": "completed",
    "content": "你好！有什么可以帮你？",
    "finishReason": "stop",
    "usage": {
      "promptTokens": 12,
      "completionTokens": 18,
      "totalTokens": 30
    },
    "citations": [],
    "toolResults": []
  }
}`,
};

export const RUN_ERROR_SAMPLE: CodeSample = {
  id: 'run-error',
  label: 'Run 错误响应示例',
  language: 'json',
  code: `{
  "code": 503,
  "message": "Runtime 服务不可用",
  "data": null
}`,
};

export const STREAM_REQUEST_SAMPLE: CodeSample = {
  id: 'stream-request',
  label: 'Stream 请求示例',
  language: 'bash',
  code: [
    'curl -N -X POST "${BASE_URL}/api/v1/stream" \\',
    '  -H "Authorization: Bearer ${API_KEY}" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Accept: text/event-stream" \\',
    `  -d '{`,
    '    "message": "你好"',
    `  }'`,
  ].join('\n'),
};

export const STREAM_SDK_SAMPLE: CodeSample = {
  id: 'stream-sdk',
  label: 'TypeScript SDK 流式调用',
  language: 'typescript',
  code: `import { MiniCozeClient, MiniCozeAbortError, MiniCozeTimeoutError } from '@minicoze/sdk';

const client = new MiniCozeClient({
  baseURL: process.env.MINICOZE_BASE_URL ?? '',
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());

try {
  for await (const event of client.stream(
    { message: '用三句话介绍 MiniCoze' },
    { signal: controller.signal },
  )) {
    switch (event.type) {
      case 'message.delta':
        process.stdout.write(event.data.content);
        break;
      case 'tool.started':
        console.log('\\n工具开始:', event.data.toolName);
        break;
      case 'tool.completed':
        console.log('工具结束:', event.data.toolName, event.data.status);
        break;
      case 'run.completed':
        console.log('\\n完成:', event.data.content);
        break;
      case 'run.failed':
        console.error('\\n失败:', event.data.code, event.data.message);
        break;
    }
  }
} catch (error) {
  if (error instanceof MiniCozeAbortError) {
    console.log('\\n已取消');
  } else if (error instanceof MiniCozeTimeoutError) {
    console.error('\\n流式调用超时');
  } else {
    throw error;
  }
}`,
};

export const STREAM_RESPONSE_SAMPLE: CodeSample = {
  id: 'stream-response',
  label: 'SSE 响应示例',
  language: 'text',
  code: `: stream-open

id: run_example:1
event: run.started
data: {"runId":"run_example","conversationId":"conversation_example","seq":1,"timestamp":"2026-11-04T00:00:00Z","type":"run.started","data":{"assistantMessageId":"assistant_message_example"}}

id: run_example:2
event: message.delta
data: {"runId":"run_example","conversationId":"conversation_example","seq":2,"timestamp":"2026-11-04T00:00:01Z","type":"message.delta","data":{"content":"你好"}}

id: run_example:3
event: run.completed
data: {"runId":"run_example","conversationId":"conversation_example","seq":3,"timestamp":"2026-11-04T00:00:02Z","type":"run.completed","data":{"runId":"run_example","conversationId":"conversation_example","assistantMessageId":"assistant_message_example","status":"completed","content":"你好！","finishReason":"stop","usage":null,"citations":[],"toolResults":[]}}`,
};

export const TOOL_EVENTS_SAMPLE: CodeSample = {
  id: 'tool-events',
  label: '工具事件示例',
  language: 'text',
  code: `id: run_example:4
event: tool.started
data: {"runId":"run_example","conversationId":"conversation_example","seq":4,"timestamp":"2026-11-04T00:00:03Z","type":"tool.started","data":{"toolCallId":"call_1","toolName":"echo_text"}}

id: run_example:5
event: tool.completed
data: {"runId":"run_example","conversationId":"conversation_example","seq":5,"timestamp":"2026-11-04T00:00:04Z","type":"tool.completed","data":{"toolCallId":"call_1","toolName":"echo_text","status":"failed","error":{"code":"TOOL_TIMEOUT","message":"工具超时"}}}

id: run_example:6
event: tool.started
data: {"runId":"run_example","conversationId":"conversation_example","seq":6,"timestamp":"2026-11-04T00:00:05Z","type":"tool.started","data":{"toolCallId":"call_2","toolName":"echo_text"}}

id: run_example:7
event: tool.completed
data: {"runId":"run_example","conversationId":"conversation_example","seq":7,"timestamp":"2026-11-04T00:00:06Z","type":"tool.completed","data":{"toolCallId":"call_2","toolName":"echo_text","status":"succeeded","output":{"text":"ok"}}}`, 
};

export const STREAM_FAILED_EVENT_SAMPLE: CodeSample = {
  id: 'stream-failed-event',
  label: 'run.failed SSE 示例',
  language: 'text',
  code: `id: run_example:8
event: run.failed
data: {"runId":"run_example","conversationId":"conversation_example","seq":8,"timestamp":"2026-11-04T00:00:07Z","type":"run.failed","data":{"code":"MODEL_UNAVAILABLE","message":"模型服务请求失败","retryable":true}}`,
};

/* ------------------------------------------------------------------ */
/* 可运行示例项目                                                       */
/* ------------------------------------------------------------------ */

export const EXAMPLE_TREE_SAMPLE: CodeSample = {
  id: 'example-tree',
  label: '项目结构',
  language: 'text',
  code: `minicoze-quickstart/
├── package.json
├── .env
├── src/
│   ├── client.ts
│   ├── run.ts
│   └── stream.ts
└── .env.example`,
};

export const EXAMPLE_PACKAGE_SAMPLE: CodeSample = {
  id: 'example-package',
  label: 'package.json',
  language: 'json',
  code: `{
  "name": "minicoze-quickstart",
  "private": true,
  "type": "module",
  "scripts": {
    "run": "node --env-file=.env --import tsx src/run.ts",
    "stream": "node --env-file=.env --import tsx src/stream.ts"
  },
  "dependencies": {
    "@minicoze/sdk": "^0.1.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0"
  }
}`,
};

export const EXAMPLE_CLIENT_SAMPLE: CodeSample = {
  id: 'example-client',
  label: 'src/client.ts',
  language: 'typescript',
  code: `import { MiniCozeClient } from '@minicoze/sdk';

const baseURL = process.env.MINICOZE_BASE_URL;
const apiKey = process.env.MINICOZE_API_KEY;

if (!baseURL || !apiKey) {
  throw new Error('缺少 MINICOZE_BASE_URL 或 MINICOZE_API_KEY');
}

export const client = new MiniCozeClient({ baseURL, apiKey });`,
};

export const EXAMPLE_RUN_SAMPLE: CodeSample = {
  id: 'example-run',
  label: 'src/run.ts',
  language: 'typescript',
  code: `import { client } from './client.js';

const result = await client.run({ message: '你好，介绍一下你自己' });

console.log('runId:', result.runId);
console.log('回答:', result.content);
console.log('会话:', result.conversationId);`,
};

export const EXAMPLE_STREAM_SAMPLE: CodeSample = {
  id: 'example-stream',
  label: 'src/stream.ts',
  language: 'typescript',
  code: `import { MiniCozeAbortError } from '@minicoze/sdk';
import { client } from './client.js';

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());

try {
  for await (const event of client.stream(
    { message: '用三句话介绍 MiniCoze' },
    { signal: controller.signal },
  )) {
    if (event.type === 'message.delta') {
      process.stdout.write(event.data.content);
    } else if (event.type === 'run.completed') {
      console.log('\\n完成:', event.data.content);
    } else if (event.type === 'run.failed') {
      console.error('\\n失败:', event.data.code, event.data.message);
    }
  }
} catch (error) {
  if (error instanceof MiniCozeAbortError) {
    console.log('\\n已取消');
  } else {
    throw error;
  }
}`,
};

export const EXAMPLE_COMMANDS_SAMPLE: CodeSample = {
  id: 'example-commands',
  label: '运行命令',
  language: 'bash',
  code: `npm install
cp .env.example .env   # Windows: copy .env.example .env
npm run run
npm run stream`,
};

/* ------------------------------------------------------------------ */
/* 参考表                                                              */
/* ------------------------------------------------------------------ */

export const REQUEST_PARAMETERS: readonly ParameterRow[] = [
  {
    name: 'message',
    type: 'string',
    description: '必填。发送给 Agent 的非空文本消息。',
  },
  {
    name: 'conversationId',
    type: 'string?',
    description: '可选。提供时继续已有会话；省略时自动创建新会话。',
  },
];

export const SSE_EVENTS: readonly EventRow[] = [
  {
    name: 'run.started',
    description: '本轮运行开始，永远是第一个业务事件。',
    data: '{ assistantMessageId: string }',
  },
  {
    name: 'knowledge.result',
    description: '知识库校验完成后返回脱敏引用，可能不出现。',
    data: "{ status: 'matched' | 'no_match'; citations: Array<{ knowledgeBaseId, documentId, chunkId, title, position? }> }",
  },
  {
    name: 'message.delta',
    description: '模型文本增量，可出现多次，拼接即为最终回答。',
    data: '{ content: string }',
  },
  {
    name: 'tool.started',
    description: '一次工具调用开始，可多轮出现。',
    data: '{ toolCallId: string; toolName: string }',
  },
  {
    name: 'tool.completed',
    description: '一次工具调用结束；status=failed 不代表 Run 终态。',
    data: "{ toolCallId, toolName, status: 'succeeded', output: unknown } | { toolCallId, toolName, status: 'failed', error: Record<string, string> }",
  },
  {
    name: 'run.completed',
    description: '唯一成功终态，data 为完整 RunResult。',
    data: '{ runId, conversationId, assistantMessageId, status: "completed", content, finishReason, usage, citations, toolResults }',
  },
  {
    name: 'run.failed',
    description: '唯一失败终态，此时 SSE 的 HTTP 连接可能仍是 200。',
    data: '{ code: string; message: string; retryable: boolean }',
  },
];

export const SDK_EXPORTS: readonly ParameterRow[] = [
  {
    name: 'MiniCozeClient',
    type: 'class',
    description: '唯一入口。new MiniCozeClient({ baseURL, apiKey, timeoutMs? })，提供 run() 和 stream()。',
  },
  {
    name: 'MiniCozeSDKError',
    type: 'class',
    description: '以下所有错误类的基类，带 httpStatus / errorCode / traceId 可选字段。',
  },
  {
    name: 'MiniCozeHTTPError',
    type: 'class',
    description: '服务端返回非 2xx 时抛出，含 httpStatus、errorCode、traceId。',
  },
  {
    name: 'MiniCozeNetworkError / MiniCozeTimeoutError / MiniCozeAbortError',
    type: 'class',
    description: '网络失败、超时（含 timeoutMs）、调用方 AbortSignal 取消。',
  },
  {
    name: 'MiniCozeResponseParseError / MiniCozeStreamError',
    type: 'class',
    description: '响应或流式事件结构不符合协议时抛出。',
  },
  {
    name: 'parseSSEStream / SSEParser',
    type: 'function / class',
    description: '底层 SSE 解析工具，仅在自定义协议处理时需要，一般直接用 stream()。',
  },
  {
    name: 'MiniCozeClientOptions / RunParams / RunOptions / RunResult / RunUsage / StreamOptions / RunStreamEvent / RunCitation',
    type: 'types',
    description: '对外导出的 TypeScript 类型，见 API 参考中的字段说明。',
  },
];

export const SDK_TYPES: readonly ParameterRow[] = [
  {
    name: 'MiniCozeClientOptions',
    type: '{ baseURL: string; apiKey: string; timeoutMs?: number }',
    description: 'baseURL 必填且必须是 http/https；apiKey 必填；timeoutMs 默认 30000。',
  },
  {
    name: 'RunParams',
    type: '{ message: string; conversationId?: string }',
    description: 'message 不能为空；conversationId 提供时必须是已存在的会话。',
  },
  {
    name: 'RunOptions',
    type: '{ signal?: AbortSignal; timeoutMs?: number }',
    description: '单次覆盖超时；run() 默认 190000ms。',
  },
  {
    name: 'RunResult',
    type: 'object',
    description: 'runId、conversationId、assistantMessageId、status、content、finishReason、usage、citations、toolResults。',
  },
  {
    name: 'StreamOptions',
    type: 'RunOptions',
    description: '与 RunOptions 相同，stream() 默认 190000ms。',
  },
  {
    name: 'RunStreamEvent',
    type: 'union',
    description: '七类事件，每类都带 runId、conversationId、seq、timestamp、sseId。',
  },
];

export const ENDPOINTS: readonly EndpointRow[] = [
  {
    name: 'Run',
    method: 'POST',
    path: '/api/v1/run',
    description: '发起一次非流式请求并返回完整结果。',
  },
  {
    name: 'Stream',
    method: 'POST',
    path: '/api/v1/stream',
    description: '发起一次 SSE 流式请求并逐事件接收结果。',
  },
];

export const HTTP_STATUSES: readonly StatusRow[] = [
  { status: '200', meaning: 'Run 成功或 Stream 已建立', note: 'Stream 建立后的业务失败通过 run.failed 事件返回。' },
  { status: '400', meaning: '请求参数或 Runtime 输入无效', note: '响应 code 为数字 400。' },
  { status: '401', meaning: 'API Key 缺失、无效或已撤销', note: '响应 code 为数字 401。' },
  { status: '403', meaning: 'Agent 未发布、已归档，或 Key 与 Agent 所有者不匹配', note: '响应 code 为数字 403。' },
  { status: '404', meaning: '会话或发布资源不存在', note: '响应 code 为数字 404。' },
  { status: '500', meaning: '消息持久化或服务内部错误', note: '响应 code 为数字 500。' },
  { status: '502', meaning: 'Runtime HTTP 或响应协议异常', note: '响应 code 为数字 502。' },
  { status: '503', meaning: 'Runtime 配置、依赖或网络不可用', note: '响应 code 为数字 503。' },
  { status: '504', meaning: 'Runtime 执行超时', note: '响应 code 为数字 504。' },
];

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: '调用时需要传 agentId 吗？',
    answer: '不需要。API Key 创建时就绑定了具体 Agent，后端只认这个绑定关系，请求体和查询参数都不能覆盖它。',
  },
  {
    question: '如何继续同一段对话？',
    answer: '使用上一次返回的 conversationId 再次调用 run() 或 stream()。该会话必须属于当前 API Key 绑定的 Agent。',
  },
  {
    question: 'SDK 的超时是多少？',
    answer: 'MiniCozeClient 的 timeoutMs 默认 30000ms；run() 与 stream() 默认整轮超时 190000ms，可用单次 options.timeoutMs 覆盖。',
  },
  {
    question: '什么是 401 和 403 的区别？',
    answer: '401 表示 API Key 本身不可用（缺失、格式错误、不存在或已撤销）；403 表示 Key 有效但 Agent 当前不可调用（草稿、归档、版本缺失或所有者不匹配）。',
  },
  {
    question: 'Stream 中途断开会怎样？',
    answer: '客户端主动取消请用 AbortSignal（SDK 抛 MiniCozeAbortError）。如果是服务端异常中断，后端会在流内补发 run.failed；缺少终态的 EOF 视为失败，SDK 会抛 MiniCozeStreamError。',
  },
  {
    question: '工具调用失败会结束 Stream 吗？',
    answer: '不会。只有 run.completed 和 run.failed 是终态，tool.completed.status=failed 只表示该次工具调用失败。',
  },
  {
    question: 'API Key 丢了怎么办？',
    answer: '创建弹窗关闭后无法再查看完整 Key，只能删除旧 Key 并新建一个。请把 Key 放在服务端环境变量或密钥管理服务里。',
  },
  {
    question: '可以在浏览器前端直接调用吗？',
    answer: '不建议。API Key 是长期凭据，放在前端会被任何访客拿到，应通过你自己的服务端转发调用。',
  },
];

export const RUNTIME_ERRORS: readonly RuntimeErrorRow[] = [
  { code: 'INTERNAL_ERROR', httpStatus: 500 },
  { code: 'INTERNAL_NOT_CONFIGURED', httpStatus: 503 },
  { code: 'INTERNAL_UNAUTHORIZED', httpStatus: 502 },
  { code: 'INVALID_REQUEST', httpStatus: 400 },
  { code: 'KNOWLEDGE_CONTEXT_TOO_LARGE', httpStatus: 502 },
  { code: 'KNOWLEDGE_FORBIDDEN', httpStatus: 403 },
  { code: 'KNOWLEDGE_NOT_CONFIGURED', httpStatus: 503 },
  { code: 'KNOWLEDGE_PROTOCOL_ERROR', httpStatus: 502 },
  { code: 'KNOWLEDGE_TIMEOUT', httpStatus: 504 },
  { code: 'KNOWLEDGE_UNAUTHORIZED', httpStatus: 502 },
  { code: 'KNOWLEDGE_UNAVAILABLE', httpStatus: 503 },
  { code: 'MODEL_AUTH_FAILED', httpStatus: 502 },
  { code: 'MODEL_NOT_CONFIGURED', httpStatus: 503 },
  { code: 'MODEL_OUTPUT_REJECTED', httpStatus: 502 },
  { code: 'MODEL_PROTOCOL_ERROR', httpStatus: 502 },
  { code: 'MODEL_QUOTA_EXCEEDED', httpStatus: 503 },
  { code: 'MODEL_RATE_LIMITED', httpStatus: 503 },
  { code: 'MODEL_STREAM_INTERRUPTED', httpStatus: 502 },
  { code: 'MODEL_TIMEOUT', httpStatus: 504 },
  { code: 'MODEL_UNAVAILABLE', httpStatus: 502 },
  { code: 'RUN_TIMEOUT', httpStatus: 504 },
  { code: 'TOOL_AUTH_FAILED', httpStatus: 502 },
  { code: 'TOOL_EXECUTION_REJECTED', httpStatus: 502 },
  { code: 'TOOL_FORBIDDEN', httpStatus: 502 },
  { code: 'TOOL_INVALID_ARGUMENTS', httpStatus: 502 },
  { code: 'TOOL_LIMIT_EXCEEDED', httpStatus: 502 },
  { code: 'TOOL_NOT_CONFIGURED', httpStatus: 503 },
  { code: 'TOOL_NOT_SUPPORTED', httpStatus: 502 },
  { code: 'TOOL_PROTOCOL_ERROR', httpStatus: 502 },
  { code: 'TOOL_RESULT_TOO_LARGE', httpStatus: 502 },
  { code: 'TOOL_TIMEOUT', httpStatus: 504 },
  { code: 'TOOL_UNAVAILABLE', httpStatus: 503 },
];
