import type { AuthUser, LoginPayload, RegisterPayload } from '../types';

/** 走 vite 的 /api 代理，同源请求，cookie（HttpOnly）才能带上 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as ErrorBody;
    const rawMessage = Array.isArray(error.message) ? error.message[0] : error.message;
    throw new ApiError(response.status, error.code ?? 'UNKNOWN', rawMessage ?? '请求失败，请稍后再试');
  }

  return payload as T;
}

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
