import type { AuthUser, LoginPayload, RegisterPayload } from '../types';
import { post } from '../../../shared/api/http';

/** 登录页 / 注册页要用它判断错误类型，所以从这里再导出一次 */
export { ApiError } from '../../../shared/api/http';

export interface AuthResult {
  accessToken?: string;
  user: AuthUser;
}

export function login(payload: LoginPayload) {
  return post<AuthResult>('/api/auth/login', payload);
}

export function register(payload: RegisterPayload) {
  return post<AuthResult>('/api/auth/register', payload);
}
