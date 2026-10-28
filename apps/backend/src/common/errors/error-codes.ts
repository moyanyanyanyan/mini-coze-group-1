/**
 * 全后端唯一的错误码字典。
 *
 * 为什么要有 code：
 * 前端不能靠 message 文案判断错误类型（文案会改、要国际化），
 * 也不能只靠 statusCode（401 可能是没带 token / token 失效 / 密码错三种情况）。
 * code 是给机器读的稳定标识，前端 switch (body.code) 分支处理。
 *
 * 这个字典是「白名单」：业务代码只能用这里列出的码，拼错会走兜底。
 */
export const ErrorCode = {
  // ---- 认证相关 ----
  /** 请求头里根本没有 Authorization */
  TOKEN_MISSING: 'TOKEN_MISSING',
  /** token 存在但解析失败 / 已过期 / 签名不对 */
  TOKEN_INVALID: 'TOKEN_INVALID',
  /** 邮箱或密码不对（用户不存在与密码错误故意合并，防止邮箱枚举） */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** 注册时邮箱已被占用 */
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',

  // ---- 权限 ----
  /** 登录了，但资源不是你的 */
  FORBIDDEN: 'FORBIDDEN',

  // ---- 通用兜底（任何模块都可能用到）----
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // ---- 聊天 ----
  /** 同一会话正在生成中，又来了一条新消息 */
  CONVERSATION_BUSY: 'CONVERSATION_BUSY',
} as const;


/** 错误码的类型。写法：把上面对象所有的值取出来组成联合类型 */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * 兜底表：业务代码抛异常时如果没指定 code，就按状态码查这里。
 * 保证响应体里永远有 code，前端不用写「code 可能不存在」的防御分支。
 */
export const DEFAULT_CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.TOKEN_INVALID,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  500: ErrorCode.INTERNAL_ERROR,
};

/** 白名单，用于校验业务代码传进来的 code 是不是合法值 */
const VALID_CODES = new Set<string>(Object.values(ErrorCode));

/**
 * 决定最终 code：优先用业务指定的，没有就按状态码兜底，
 * 连状态码都没覆盖到就归为 INTERNAL_ERROR。
 */
export function resolveErrorCode(status: number, code?: unknown): ErrorCode {
  if (typeof code === 'string' && VALID_CODES.has(code)) {
    return code as ErrorCode;
  }
  return DEFAULT_CODE_BY_STATUS[status] ?? ErrorCode.INTERNAL_ERROR;
}
