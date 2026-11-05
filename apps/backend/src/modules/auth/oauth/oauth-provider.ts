/**
 * 我们自己的 OAuth 契约。
 * 上层业务（AuthService）只认识这个接口，不认识 Google。
 */

/** 从 OAuth 提供方拿到的「这个人是谁」 */
export interface OAuthProfile {
  /** 提供方那边的用户唯一 ID（Google 的 sub）。长期稳定，用户改邮箱也不会变 */
  providerUserId: string;
  email: string;
  /** Google 保证这个邮箱属于本人。false 的话绝不能用来登录 */
  emailVerified: boolean;
  displayName: string;
  avatarUrl?: string;
}

export interface OAuthProvider {
  /** 造一个「去授权页」的 URL，前端整页跳过去 */
  buildAuthorizeUrl(state: string): string;

  /** 拿一次性 code 换 access_token —— 需要 client_secret，所以只能在后端做 */
  exchangeCode(code: string): Promise<{ accessToken: string }>;

  /** 用 access_token 取用户资料 */
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
}

/** DI 注入令牌：让 Nest 能分辨「这个接口的实现是哪一个」 */
export const OAUTH_PROVIDER = Symbol('OAUTH_PROVIDER');
