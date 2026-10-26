export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface MockAgent {
  id: string;
  name: string;
  description: string;
  avatarUrl?: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number;
  openingMessage?: string;
  status: AgentStatus;
  pluginBindings: Array<{ id: string; pluginId: string; enabled: boolean; autoInvoke: boolean }>;
  knowledgeBaseBindings: Array<{ id: string; knowledgeBaseId: string; enabled: boolean }>;
  workflowBindings: Array<{ id: string; workflowId: string; enabled: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface MockKnowledgeBase {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'DISABLED';
}

export interface MockPlugin {
  pluginId: string;
  title: string;
  content: string;
}

export const mockAgents: MockAgent[] = [
  {
    id: 'agent-clx8a1',
    name: '客服助手',
    description: '自动回复常见问题，处理订单咨询',
    systemPrompt: '你是一个专业的客服助手，请用礼貌语气回复用户的问题。当问题超出你的能力范围时，诚实告知用户。',
    model: 'deepseek-chat',
    temperature: 0.5,
    maxTokens: 2048,
    contextLimit: 20,
    openingMessage: '你好！我是客服助手，有什么可以帮你？',
    status: 'DRAFT',
    pluginBindings: [
      { id: 'bp1', pluginId: 'plugin_time', enabled: true, autoInvoke: true },
      { id: 'bp2', pluginId: 'plugin_echo', enabled: true, autoInvoke: false },
    ],
    knowledgeBaseBindings: [
      { id: 'bk1', knowledgeBaseId: 'kb-uuid-1', enabled: true },
    ],
    workflowBindings: [],
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-26T08:30:00.000Z',
  },
  {
    id: 'agent-clx8a2',
    name: '写作助手',
    description: '帮助用户润色文章、生成大纲',
    systemPrompt: '你是一个资深写作助手，擅长文章润色、大纲生成和风格调整。请根据用户需求提供具体、可操作的建议。',
    model: 'deepseek-ai/DeepSeek-V3.2',
    temperature: 1.2,
    maxTokens: 4096,
    contextLimit: 15,
    openingMessage: undefined,
    status: 'ACTIVE',
    pluginBindings: [
      { id: 'bp3', pluginId: 'plugin_echo', enabled: true, autoInvoke: false },
    ],
    knowledgeBaseBindings: [],
    workflowBindings: [],
    createdAt: '2026-10-18T14:20:00.000Z',
    updatedAt: '2026-10-25T11:00:00.000Z',
  },
  {
    id: 'agent-clx8a3',
    name: '代码助手',
    description: '解释代码、生成注释、重构建议',
    systemPrompt: '你是一个精通多种编程语言的代码助手。请在回复中提供可运行的代码示例，并解释关键设计决策。',
    model: 'deepseek-chat',
    temperature: 0.3,
    maxTokens: 4096,
    contextLimit: 25,
    openingMessage: '贴一段代码过来，我帮你看看。',
    status: 'DRAFT',
    pluginBindings: [],
    knowledgeBaseBindings: [],
    workflowBindings: [],
    createdAt: '2026-10-25T09:00:00.000Z',
    updatedAt: '2026-10-25T09:00:00.000Z',
  },
];

export const mockKnowledgeBases: MockKnowledgeBase[] = [
  { id: 'kb-uuid-1', name: '产品手册', description: 'MiniCoze 完整产品说明书', status: 'ACTIVE' },
  { id: 'kb-uuid-2', name: 'API 文档', description: '后端接口参考', status: 'ACTIVE' },
  { id: 'kb-uuid-3', name: '历史对话', description: '过往用户对话记录', status: 'DISABLED' },
];

export const mockPlugins: MockPlugin[] = [
  { pluginId: 'plugin_time', title: '当前时间', content: '返回当前日期时间' },
  { pluginId: 'plugin_echo', title: '文本回显', content: '将输入文本原样返回' },
];

export const modelOptions = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2 (硅基流动)' },
];

export const contextLimitOptions = [0, 5, 10, 20, 50, 100];
