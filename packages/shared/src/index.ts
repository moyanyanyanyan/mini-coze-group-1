// 用户身份契约

export interface HealthResponse {
  status: 'ok';
  service: 'backend' | 'agent';
}

/**
 * 全组统一的用户身份契约（E1）。
 * 详细规则见 docs/契约-用户身份-CurrentUser与AuthResponse.md
 *
 * 铁律：
 *   R1  passwordHash 永远不出现在这个类型里，也永远不返回给前端
 *   R3  这里的 id 恒为用户表主键（UUID），
 *       Runtime 的 actor.id、Agent 的 ownerId 都以它为准
 */
export interface CurrentUser {
  /** 用户表主键（UUID），全组各模块引用用户时统一用它 */
  id: string;
  /** 登录邮箱，全局唯一 */
  email: string;
  /** 展示昵称 */
  displayName: string;
  /** 头像地址；没设置过就是 undefined，所以是可选字段 */
  avatarUrl?: string;
}

/**
 * 登录/注册成功的响应体（E1 配套）。
 * register(201) 和 login(200) 都返回这个结构。
 */
export interface AuthResponse {
  /** JWT，前端之后每个需要登录的请求都在 Header 里带它 */
  accessToken: string;
  /** 刚登录/注册的用户本体 */
  user: CurrentUser;
}

// ---------- 会话与消息契约（B 模块）----------

/** 消息发送方 */
export type MessageRole = 'user' | 'assistant';

/** pending 未开始 / running 生成中 / completed 完成 / failed 失败 / cancelled 用户停止 */
export type MessageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * 会话列表用。
 * 列表接口一次返回几十个会话，所以这里刻意不带消息体，
 * 点进某个会话时才单独拉 ChatMessage[]。
 */
export interface ConversationSummary {
  id: string;
  /** 默认「新对话」，发第一条消息后改成用户第一句话的前 20 字 */
  title: string;
  /** 可有可无：陈弘毅的 Agent 表合进来之前允许为空 */
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 单条消息。历史拉取与实时推送都用这一个结构 */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  status: MessageStatus;
  /** 本会话内的自增序号，排序与「最多 20 条」截断都靠它 */
  seq: number;
  content: string;
  createdAt: string;
}

/**
 * 发一条消息的返回结果（阶段 1：非流式）。
 * 一次发消息会落两条：用户提问 + 助手回答，一起返回省掉前端再拉一次历史。
 * 阶段 2 接 Runtime 后，这个接口改成返回 SSE 流，这个类型就退居二线。
 */
export interface SendMessageResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}
