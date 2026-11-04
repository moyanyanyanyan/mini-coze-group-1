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
  { id: 'api-key-usage', label: 'API Key 使用说明' },
  { id: 'run-sync', label: 'Run 同步调用' },
  { id: 'stream', label: 'Stream 流式调用' },
  { id: 'typescript-sdk', label: 'TypeScript SDK' },
  { id: 'api-reference', label: 'API 参考' },
  { id: 'faq', label: '常见问题' },
];

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
  baseURL: 'http://127.0.0.1:3100',
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});

const result = await client.run({
  message: '你好',
});

console.log(result.content);
console.log(result.conversationId);`;

export const QUICK_START_SAMPLES: readonly CodeSample[] = [
  {
    id: 'curl',
    label: 'curl',
    language: 'bash',
    code: curlRunCode,
  },
  {
    id: 'typescript',
    label: 'TypeScript SDK',
    language: 'typescript',
    code: typescriptRunCode,
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
  "message": "Runtime unavailable",
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
  label: 'TypeScript SDK 流式接口',
  language: 'typescript',
  code: `import { MiniCozeClient, MiniCozeStreamError } from '@minicoze/sdk';

const client = new MiniCozeClient({
  baseURL: 'http://127.0.0.1:3100',
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});

const controller = new AbortController();

try {
  for await (const event of client.stream(
    { message: '你好' },
    { signal: controller.signal },
  )) {
    if (event.type === 'message.delta') {
      process.stdout.write(event.data.content);
    }
    if (event.type === 'tool.started') {
      console.log('工具开始:', event.data.toolName);
    }
    if (event.type === 'tool.completed') {
      console.log('工具结束:', event.data.toolName, event.data.status);
    }
    if (event.type === 'run.completed') {
      console.log('\\n完成:', event.data.content);
    }
    if (event.type === 'run.failed') {
      console.error(event.data.code, event.data.message);
    }
  }
} catch (error) {
  if (error instanceof MiniCozeStreamError) {
    console.error('Stream 失败', error.message);
  }
}

// 需要提前结束时调用 controller.abort()`,
};

export const STREAM_RESPONSE_SAMPLE: CodeSample = {
  id: 'stream-response',
  label: 'SSE 响应示例',
  language: 'text',
  code: `id: run_example:1
event: run.started
data: {"runId":"run_example","conversationId":"conversation_example","seq":1,"timestamp":"2026-11-04T00:00:00Z","type":"run.started","data":{"assistantMessageId":"assistant_message_example"}}

id: run_example:2
event: message.delta
data: {"runId":"run_example","conversationId":"conversation_example","seq":2,"timestamp":"2026-11-04T00:00:01Z","type":"message.delta","data":{"content":"你好"}}

id: run_example:3
event: run.completed
data: {"runId":"run_example","conversationId":"conversation_example","seq":3,"timestamp":"2026-11-04T00:00:02Z","type":"run.completed","data":{"runId":"run_example","conversationId":"conversation_example","assistantMessageId":"assistant_message_example","status":"completed","content":"你好！","finishReason":"stop","usage":null,"citations":[],"toolResults":[]}}`,
};

export const SDK_INSTALL_SAMPLE: CodeSample = {
  id: 'sdk-install',
  label: 'SDK 安装说明',
  language: 'bash',
  code: `# @minicoze/sdk 当前是仓库内 private package
# npm 包发布与安装方式待确认`,
};

export const SDK_INIT_SAMPLE: CodeSample = {
  id: 'sdk-init',
  label: '客户端初始化',
  language: 'typescript',
  code: `import { MiniCozeClient } from '@minicoze/sdk';

const client = new MiniCozeClient({
  baseURL: 'http://127.0.0.1:3100',
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});`,
};

export const SDK_ERROR_SAMPLE: CodeSample = {
  id: 'sdk-error',
  label: '基本错误处理',
  language: 'typescript',
  code: `import { MiniCozeHTTPError } from '@minicoze/sdk';

try {
  const result = await client.run({ message: '你好' });
  console.log(result.content);
} catch (error) {
  if (error instanceof MiniCozeHTTPError) {
    console.error(error.httpStatus, error.message);
  }
}`,
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
data: {"runId":"run_example","conversationId":"conversation_example","seq":5,"timestamp":"2026-11-04T00:00:04Z","type":"tool.completed","data":{"toolCallId":"call_1","toolName":"echo_text","status":"failed","error":{"code":"TOOL_TIMEOUT","message":"工具超时"}}}`,
};

export const REQUEST_PARAMETERS: readonly ParameterRow[] = [
  {
    name: 'message',
    type: 'string',
    description: '必填。发送给 Agent 的非空文本消息。',
  },
  {
    name: 'conversationId',
    type: 'string?',
    description: '可选。提供时继续已有会话；省略时创建新会话。',
  },
];

export const SSE_EVENTS: readonly EventRow[] = [
  { name: 'run.started', description: '本轮运行开始，包含 assistantMessageId。' },
  { name: 'knowledge.result', description: '知识库上下文校验通过后返回状态和脱敏引用。' },
  { name: 'message.delta', description: '模型文本增量，可出现多次。' },
  { name: 'tool.started', description: '一次工具调用开始，包含 toolCallId 和 toolName。' },
  { name: 'tool.completed', description: '一次工具调用结束；status=failed 不代表 Run 终态。' },
  { name: 'run.completed', description: '成功终态，data 为完整 RuntimeResult。' },
  { name: 'run.failed', description: '失败终态，包含 code、message 和 retryable。' },
];

export const SDK_TYPES: readonly ParameterRow[] = [
  {
    name: 'MiniCozeClientOptions',
    type: 'object',
    description: '包含必填 baseURL、apiKey 和可选 timeoutMs。',
  },
  {
    name: 'RunParams',
    type: 'object',
    description: '包含必填 message 和可选 conversationId。',
  },
  {
    name: 'RunOptions',
    type: 'object',
    description: '包含可选 signal 和单次 timeoutMs。',
  },
  {
    name: 'RunResult',
    type: 'object',
    description: '非流式 Run 的结构化结果。',
  },
  {
    name: 'StreamOptions',
    type: 'object',
    description: '包含可选 signal 和单次 timeoutMs，Stream 默认超时 190000ms。',
  },
  {
    name: 'RunStreamEvent',
    type: 'union',
    description: 'SDK 流式接口返回的七类 Runtime SSE 事件。',
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
  { status: '200', meaning: 'Run 成功', note: '响应 code 为数字 200。' },
  { status: '400', meaning: '请求参数或 Runtime 输入无效', note: '响应 code 为数字 400。' },
  { status: '401', meaning: 'API Key 无效或已撤销', note: '响应 code 为数字 401。' },
  { status: '403', meaning: 'Agent 未发布、已归档或无调用权限', note: '响应 code 为数字 403。' },
  { status: '404', meaning: '会话或发布资源不存在', note: '响应 code 为数字 404。' },
  { status: '500', meaning: '消息持久化或服务内部错误', note: '响应 code 为数字 500。' },
  { status: '502', meaning: 'Runtime HTTP 或响应协议异常', note: '响应 code 为数字 502。' },
  { status: '503', meaning: '测试 Agent、Runtime 配置或网络不可用', note: '响应 code 为数字 503。' },
  { status: '504', meaning: 'Runtime 执行超时', note: '响应 code 为数字 504。' },
];

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: '调用时需要传 agentId 吗？',
    answer: '不需要。目标 Agent 由 API Key 的绑定关系确定；正式鉴权接入前，开发环境使用临时测试 Agent 配置。',
  },
  {
    question: '如何继续已有会话？',
    answer: '在请求体或 SDK RunParams 中提供 conversationId。会话必须属于该 Agent 的 owner。',
  },
  {
    question: 'SDK 的超时是多少？',
    answer: 'run() 和 stream() 默认整轮超时均为 190000ms，可通过单次调用 options.timeoutMs 覆盖；两者都支持 AbortSignal。',
  },
  {
    question: 'API Key 鉴权如何使用？',
    answer: 'API Key Guard 已接入公开 Run 和 Stream；无效或撤销 Key 返回 401，Agent 状态不允许调用时返回 403。',
  },
  {
    question: 'Stream 和 SSE 事件是否已经可用？',
    answer: '已可用。Stream 使用 POST /api/v1/stream，以 run.completed 或 run.failed 作为唯一终态。',
  },
  {
    question: '工具调用失败会结束 Stream 吗？',
    answer: '不会。只有 run.completed 和 run.failed 是 Run 终态；tool.completed.status=failed 只表示该次工具调用失败，后续仍可继续工具轮次或生成最终回答。',
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
