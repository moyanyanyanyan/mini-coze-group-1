import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function contextWithAuthorization(authorization?: string) {
  const request = { headers: { authorization } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  return { context, request };
}

describe('ApiKeyGuard', () => {
  it('attaches the authenticated principal to the request', async () => {
    const principal = { userId: 'user-1', agentId: 'agent-1', apiKeyId: 'key-1' };
    const apiKeys = { authenticate: jest.fn().mockResolvedValue(principal) };
    const guard = new ApiKeyGuard(apiKeys as never);
    const { context, request } = contextWithAuthorization('Bearer mk_live_secret');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(apiKeys.authenticate).toHaveBeenCalledWith('mk_live_secret');
    expect(request).toEqual(expect.objectContaining({ apiKeyPrincipal: principal }));
  });

  it.each([
    ['missing', undefined],
    ['wrong scheme', 'Basic abc'],
    ['empty bearer', 'Bearer '],
    ['extra token', 'Bearer abc def'],
  ])('rejects a %s authorization header', async (_case, authorization) => {
    const apiKeys = { authenticate: jest.fn() };
    const guard = new ApiKeyGuard(apiKeys as never);
    const { context } = contextWithAuthorization(authorization);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(apiKeys.authenticate).not.toHaveBeenCalled();
  });
});
