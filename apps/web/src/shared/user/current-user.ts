import { useSyncExternalStore } from 'react';
import type { AuthUser } from '../../features/auth/types';

/**
 * 当前登录用户的全局快照。
 * 布局和页面共用这一份，避免各自 getMe 后互相看不到更新。
 */
let currentUser: AuthUser | null = null;
const listeners = new Set<() => void>();

export function setCurrentUser(user: AuthUser | null): void {
  currentUser = user;
  for (const listener of listeners) {
    listener();
  }
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentUser(): AuthUser | null {
  return useSyncExternalStore(subscribe, getCurrentUser, getCurrentUser);
}
