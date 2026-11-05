import type { AuthUser, LoginPayload, RegisterPayload } from '../types';
import { get, post } from '../../../shared/api/http';

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

export function logout() {
  return post<{ ok: boolean }>('/api/auth/logout');
}

export function getMe() {
  return get<AuthUser>('/api/auth/me');
}
