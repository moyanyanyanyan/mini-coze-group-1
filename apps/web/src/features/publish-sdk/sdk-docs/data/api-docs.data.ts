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
  label: 'Stream 接口占位',
  language: 'bash',
  code: `# Stream API 尚未实现
# 公开路径、请求字段、结束标识和 SSE 事件均待正式契约确认`,
};

export const STREAM_SDK_SAMPLE: CodeSample = {
  id: 'stream-sdk',
  label: 'TypeScript SDK 流式接口',
  language: 'typescript',
  code: `// 当前 SDK 仅实现非流式 run()
// client.stream() 尚待公开 Stream API 与事件契约确认`,
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

export const SSE_EVENTS: readonly EventRow[] = [];

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
    method: '待确认',
    path: '待确认',
    description: '公开流式接口尚未实现。',
  },
];

export const HTTP_STATUSES: readonly StatusRow[] = [
  { status: '200', meaning: 'Run 成功', note: '响应 code 为数字 200。' },
  { status: '400', meaning: '请求参数或 Runtime 输入无效', note: '响应 code 为数字 400。' },
  { status: '401', meaning: '鉴权失败', note: '正式 API Key 鉴权接入后确认具体语义。' },
  { status: '403', meaning: 'Agent 或会话不允许公开调用', note: '响应 code 为数字 403。' },
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
    question: 'SDK 的 Run 超时是多少？',
    answer: 'run() 默认超时为 190000ms，可通过单次调用 options.timeoutMs 覆盖，并支持 AbortSignal。',
  },
  {
    question: '为什么 API Key 鉴权还不能正式使用？',
    answer: '管理端 CRUD 已完成，但公开接口的 API Key Guard 与正式错误契约尚未接入。当前开发入口不代表正式鉴权方案。',
  },
  {
    question: 'Stream 和 SSE 事件是否已经可用？',
    answer: '尚未实现。公开 Stream 路径、事件、结束标识和错误语义仍需等待正式契约。',
  },
];
