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
