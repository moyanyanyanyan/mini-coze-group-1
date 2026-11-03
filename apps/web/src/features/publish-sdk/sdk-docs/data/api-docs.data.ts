/** Static content used by the SDK documentation prototype. */
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
  'curl -X POST "${BASE_URL}/${RUN_PATH}" \\',
  '  -H "Authorization: Bearer ${API_KEY}" \\',
  '  -H "Content-Type: application/json" \\',
  '  -H "X-Trace-Id: ${TRACE_ID}" \\',
  `  -d '{`,
  '    "agentId": "YOUR_AGENT_ID",',
  '    "input": {',
  '      "query": "Hello"',
  '    }',
  `  }'`,
].join('\n');

const typescriptRunCode = `// Mock 示例：导入路径、字段和参数待正式契约确认
import { MiniCozeClient } from '@minicoze/sdk';

const client = new MiniCozeClient({
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});

const result = await client.run({
  agentId: 'YOUR_AGENT_ID',
  input: { query: 'Hello' },
});

console.log(result);`;

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
  "runId": "run_mock_example",
  "status": "succeeded",
  "output": {
    "text": "Hello from MiniCoze"
  },
  "usage": {
    "inputTokens": 12,
    "outputTokens": 18
  }
}`,
};

export const RUN_ERROR_SAMPLE: CodeSample = {
  id: 'run-error',
  label: 'Run 错误响应示例',
  language: 'json',
  code: `{
  "error": {
    "code": "MOCK_ERROR",
    "message": "Mock error message"
  }
}`,
};

export const STREAM_REQUEST_SAMPLE: CodeSample = {
  id: 'stream-request',
  label: 'Stream 调试示例',
  language: 'bash',
  code: [
    'curl -N -X POST "${BASE_URL}/${STREAM_PATH}" \\',
    '  -H "Authorization: Bearer ${API_KEY}" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Accept: text/event-stream" \\',
    '  -H "X-Trace-Id: ${TRACE_ID}" \\',
    `  -d '{`,
    '    "agentId": "YOUR_AGENT_ID",',
    '    "input": {',
    '      "query": "Hello"',
    '    }',
    `  }'`,
  ].join('\n'),
};

export const STREAM_SDK_SAMPLE: CodeSample = {
  id: 'stream-sdk',
  label: 'TypeScript SDK 流式示例',
  language: 'typescript',
  code: `// Mock 示例：事件字段和调用参数待正式契约确认
const stream = client.stream({
  agentId: 'YOUR_AGENT_ID',
  input: { query: 'Hello' },
});

for await (const event of stream) {
  if (event.type === 'token') {
    process.stdout.write(event.data.text ?? '');
  }

  if (event.type === 'done') {
    break;
  }
}`,
};

export const SDK_INSTALL_SAMPLE: CodeSample = {
  id: 'sdk-install',
  label: 'SDK 安装占位',
  language: 'bash',
  code: `# Mock 占位：安装包名称与发布渠道待 SDK 方案确认
# 当前示例不能直接运行`,
};

export const SDK_INIT_SAMPLE: CodeSample = {
  id: 'sdk-init',
  label: '客户端初始化',
  language: 'typescript',
  code: `// Mock 示例：导入路径与配置字段待正式契约确认
import { MiniCozeClient } from '@minicoze/sdk';

const client = new MiniCozeClient({
  apiKey: process.env.MINICOZE_API_KEY ?? '',
});`,
};

export const SDK_ERROR_SAMPLE: CodeSample = {
  id: 'sdk-error',
  label: '基本错误处理',
  language: 'typescript',
  code: `// Mock 示例：错误类型和字段待正式契约确认
try {
  const result = await client.run({
    agentId: 'YOUR_AGENT_ID',
    input: { query: 'Hello' },
  });

  console.log(result);
} catch (error) {
  console.error('MiniCoze request failed', error);
}`,
};

export const REQUEST_PARAMETERS: readonly ParameterRow[] = [
  {
    name: 'agentId',
    type: 'string',
    description: '已发布 Agent 的标识。',
  },
  {
    name: 'input',
    type: 'object',
    description: '本次调用的输入参数；具体字段待契约确认。',
  },
];

export const SSE_EVENTS: readonly EventRow[] = [
  { name: 'start', description: '表示本次调用开始' },
  { name: 'token', description: '表示收到文本增量' },
  { name: 'tool_call', description: '表示工具调用信息' },
  { name: 'tool_result', description: '表示工具执行结果' },
  { name: 'reference', description: '表示引用信息' },
  { name: 'done', description: '表示本次调用结束' },
  { name: 'error', description: '表示流式调用发生错误' },
];

export const SDK_TYPES: readonly ParameterRow[] = [
  {
    name: 'RunParams',
    type: 'object',
    description: '同步调用参数；最终字段待契约确认。',
  },
  {
    name: 'RunResult',
    type: 'object',
    description: '同步调用结果；最终字段待契约确认。',
  },
  {
    name: 'StreamEvent',
    type: 'event',
    description: '流式调用事件；事件数据类型待契约确认。',
  },
];

export const ENDPOINTS: readonly EndpointRow[] = [
  {
    name: 'Run',
    method: 'POST',
    path: '${BASE_URL}/${RUN_PATH}',
    description: '发起一次请求并返回完整结果。',
  },
  {
    name: 'Stream',
    method: 'POST',
    path: '${BASE_URL}/${STREAM_PATH}',
    description: '建立 SSE 连接并逐步接收执行事件。',
  },
];

export const HTTP_STATUSES: readonly StatusRow[] = [
  { status: '200', meaning: '请求成功', note: '成功响应字段仍待确认。' },
  { status: '401', meaning: '身份验证失败', note: '检查 API Key 与鉴权请求头。' },
  { status: '404', meaning: '资源不存在', note: '检查 Agent 标识与请求路径。' },
  { status: '429', meaning: '请求受限', note: '具体限流规则待确认。' },
  { status: '500', meaning: '服务异常', note: '错误结构待正式契约确认。' },
];

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'API Key 鉴权失败怎么办？',
    answer: '检查 Authorization 请求头是否使用 Bearer 格式，并确认 API Key 仍然有效。不要在前端代码或公开仓库中硬编码真实密钥。',
  },
  {
    question: 'Agent 标识或请求参数错误怎么办？',
    answer: '核对 agentId 是否为已发布 Agent 的标识，并按照待确认的接口契约检查 input 参数。当前文档不提供 Agent ID 查询入口。',
  },
  {
    question: '请求触发限流怎么办？',
    answer: '暂停高频重试，记录 Trace ID，并根据后续确认的限流规则调整请求频率。',
  },
  {
    question: '请求超时怎么办？',
    answer: '先保留 Trace ID 以便排查，再检查网络和服务状态。真实超时阈值与重试策略待接口契约确认。',
  },
  {
    question: 'SSE 连接意外中断怎么办？',
    answer: '将中断视为未完成调用并展示可恢复状态。是否需要重连、断点续传或重新发起调用，需要以后端流式契约为准。',
  },
];
