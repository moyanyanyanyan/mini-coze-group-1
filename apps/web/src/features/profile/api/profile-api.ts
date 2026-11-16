import { get, patch, postForm } from '../../../shared/api/http';
import type { AuthUser } from '../../auth/types';

/** /api/users/* 被后端 ResponseInterceptor 包成 { code, message, data }，这里统一拆包 */
interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface ProfileUser extends AuthUser {
  googleLinked: boolean;
  hasPassword: boolean;
}

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
}

export async function getProfile(): Promise<ProfileUser> {
  return (await get<Envelope<ProfileUser>>('/api/users/me')).data;
}

export async function saveDisplayName(displayName: string): Promise<AuthUser> {
  return (await patch<Envelope<AuthUser>>('/api/users/me', { displayName })).data;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await patch<Envelope<null>>('/api/users/me/password', input);
}

export async function uploadAvatar(file: File): Promise<AuthUser> {
  const form = new FormData();
  form.append('file', file);
  return (await postForm<Envelope<AuthUser>>('/api/users/me/avatar', form)).data;
}