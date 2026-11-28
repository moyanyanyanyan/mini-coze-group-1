import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { ApiTelemetryMiddleware } from './api-telemetry.middleware';
import { operationRequestContext } from './request-context';

function setup() {
  const record = jest.fn().mockResolvedValue(undefined);
  const findUnique = jest.fn().mockResolvedValue(null);
  const middleware = new ApiTelemetryMiddleware({ record } as never, { apiKey: { findUnique } } as never);
  const request = { method: 'POST', path: '/api/v1/run', headers: {} };
  const response = Object.assign(new EventEmitter(), { statusCode: 200, headersSent: true, writableFinished: true, setHeader: jest.fn() });
  return { middleware, record, findUnique, request, response };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

it.each(['failed', 'interrupted'])('区分 HTTP 200 与 Runtime %s，finish/close 只记录一次', async runtimeStatus => {
  const { middleware, record, request, response } = setup();
  middleware.use(request as never, response as never, () => {
    const context = operationRequestContext.getStore()!;
    context.request.apiKeyPrincipal = { userId: 'owner', agentId: 'agent', apiKeyId: 'key' };
    context.runId = 'run'; context.runtimeStatus = runtimeStatus;
  });
  response.emit('finish'); response.emit('close'); await flush();
  expect(record).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'owner', kind: 'api', status: 'failed', runId: 'run', apiKeyId: 'key', data: expect.objectContaining({ httpStatus: 200, runtimeStatus }) }));
});

it('模型完成但消息保存失败时，API 请求仍按业务失败统计', async () => {
  const { middleware, record, request, response } = setup();
  middleware.use(request as never, response as never, () => {
    const context = operationRequestContext.getStore()!;
    context.runtimeStatus = 'completed'; context.businessStatus = 'failed';
  });
  response.emit('finish'); await flush();
  expect(record.mock.calls[0][0]).toMatchObject({ status: 'failed', data: { runtimeStatus: 'completed', businessStatus: 'failed' } });
});

it('被撤销密钥只按哈希匹配归属，记录不保存原始密钥', async () => {
  const { middleware, record, findUnique, request, response } = setup();
  const secret = 'mk_live_' + 'a'.repeat(43);
  request.headers = { authorization: 'Bearer ' + secret } as never;
  response.statusCode = 401;
  findUnique.mockResolvedValue({ id: 'revoked-key', agentId: 'agent', agent: { ownerId: 'owner' } });
  middleware.use(request as never, response as never, () => {});
  response.emit('finish'); await flush();
  expect(findUnique.mock.calls[0][0].where.keyHash).toBe(createHash('sha256').update(secret).digest('hex'));
  expect(record.mock.calls[0][0]).toMatchObject({ ownerId: 'owner', apiKeyId: 'revoked-key', status: 'failed' });
  expect(JSON.stringify(record.mock.calls)).not.toContain(secret);
});

it('流式断开标记中断，无法确认归属的请求不归给其他用户', async () => {
  const { middleware, record, request, response } = setup();
  response.writableFinished = false;
  response.headersSent = false;
  middleware.use(request as never, response as never, () => {});
  response.emit('close'); await flush();
  expect(record.mock.calls[0][0]).toMatchObject({ ownerId: undefined, status: 'cancelled' });
  expect(record.mock.calls[0][0].data.httpStatus).toBeNull();
});
