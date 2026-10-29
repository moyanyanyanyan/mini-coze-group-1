/**
 * 全前端唯一的 HTTP 出口。
 * 所有请求都从这里走，保证三件事只写一遍：
 *   1. 带 credentials，HttpOnly Cookie 才送得出去
 *   2. 非 2xx 统一转成 ApiError，业务代码只管 try/catch
 *   3. 走 vite 的 /api 代理，同源请求
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

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

/** 后端统一错误响应体（http-exception.filter.ts 保证这个结构） */
interface ErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 204 No Content 没有响应体，直接结束
  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as ErrorBody;
    const rawMessage = Array.isArray(error.message) ? error.message[0] : error.message;
    throw new ApiError(
      response.status,
      error.code ?? 'UNKNOWN',
      rawMessage ?? '请求失败，请稍后再试',
    );
  }

  return payload as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}
