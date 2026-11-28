import { afterEach, describe, expect, it } from 'vitest';
import { getCurrentUser, setCurrentUser } from './current-user';

const user = {
  id: 'user-1',
  email: 'u@test.com',
  displayName: '旧昵称',
};

afterEach(() => {
  setCurrentUser(null);
});

describe('current user store', () => {
  it('holds the latest user snapshot after an update', () => {
    expect(getCurrentUser()).toBeNull();
    setCurrentUser(user);
    expect(getCurrentUser()?.displayName).toBe('旧昵称');
    setCurrentUser({ ...user, displayName: '新昵称' });
    expect(getCurrentUser()?.displayName).toBe('新昵称');
  });
});
