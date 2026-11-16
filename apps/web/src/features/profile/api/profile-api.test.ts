import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { changePassword, getProfile, saveDisplayName, uploadAvatar } from './profile-api';

function envelope(status: number, data: unknown) {
  return new Response(JSON.stringify({ code: status, message: 'ok', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(respond: () => Response) {
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => respond());
  vi.stubGlobal('fetch', mock);
  return mock;
}

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ code: status, message, data: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('profile API', () => {
  it('unwraps the envelope from GET /api/users/me', async () => {
    const profile = {
      id: 'user-1',
      email: 'u@test.com',
      displayName: '昵称',
      avatarUrl: null,
      googleLinked: false,
      hasPassword: true,
    };
    const fetchMock = stubFetch(() => envelope(200, profile));

    await expect(getProfile()).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('sends only displayName when saving the nickname', async () => {
    const fetchMock = stubFetch(() => envelope(200, {
      id: 'user-1',
      email: 'u@test.com',
      displayName: '新昵称',
      avatarUrl: null,
    }));

    await expect(saveDisplayName('新昵称')).resolves.toMatchObject({ displayName: '新昵称' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ displayName: '新昵称' }));
  });

  it('omits currentPassword for a Google-only account', async () => {
    const fetchMock = stubFetch(() => envelope(200, null));

    await changePassword({ newPassword: 'newpass888' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ newPassword: 'newpass888' }));
  });

  it('includes currentPassword when changing an existing password', async () => {
    const fetchMock = stubFetch(() => envelope(200, null));

    await changePassword({ currentPassword: '12345678', newPassword: 'newpass888' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ currentPassword: '12345678', newPassword: 'newpass888' }));
  });

  it('uploads the avatar as multipart FormData', async () => {
    const fetchMock = stubFetch(() => envelope(201, {
      id: 'user-1',
      email: 'u@test.com',
      displayName: '昵称',
      avatarUrl: '/api/users/avatar/u1.png',
    }));
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', { type: 'image/png' });

    const updated = await uploadAvatar(file);
    expect(updated.avatarUrl).toBe('/api/users/avatar/u1.png');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
    expect(init.headers).toBeUndefined();
  });

  it('surfaces avatar validation errors', async () => {
    stubFetch(() => errorResponse(400, '头像大小不能超过 5MB'));
    const file = new File([new Uint8Array([1])], 'big.png', { type: 'image/png' });

    const error = await uploadAvatar(file).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe('头像大小不能超过 5MB');
  });

  it('surfaces a 401 as ApiError with the server message', async () => {
    stubFetch(() => errorResponse(401, '当前密码不正确'));

    const error = await changePassword({ currentPassword: 'wrong', newPassword: 'newpass888' })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe('当前密码不正确');
  });
});
