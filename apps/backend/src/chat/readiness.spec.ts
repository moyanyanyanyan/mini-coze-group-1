import { HttpExceptionFilter } from '../common/http-exception.filter';
import { ServiceUnavailableException } from '@nestjs/common';
import { RuntimeClientService } from './runtime-client.service';
import { ChatController } from './chat.controller';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

it.each([
  [200, 'ready', 'ready'], [503, 'starting', 'starting'], [503, 'failed', 'failed'],
  [200, 'starting', 'unavailable'], [500, 'ready', 'unavailable'],
])('validates readiness response %s %s', async (code, status, expected) => {
  global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status }), { status: code }));
  const runtime = new RuntimeClientService();
  expect(await runtime.readiness()).toEqual({ status: expected });
});

it('rejects a disconnected service', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  await expect(new RuntimeClientService().assertReady()).rejects.toBeInstanceOf(ServiceUnavailableException);
});

it('checks readiness before acquiring a lock or opening SSE', async () => {
  const chat = { assertReady: jest.fn().mockRejectedValue(new ServiceUnavailableException()), acquire: jest.fn() };
  const conversations = { assertOwned: jest.fn().mockResolvedValue({ agentId: 'agent' }) };
  const agents = { getAgentConfig: jest.fn().mockResolvedValue({}) };
  const response = { writeHead: jest.fn(), write: jest.fn() };
  const controller = new ChatController(chat as never, conversations as never, agents as never);
  await expect(controller.stream('conversation', { content: 'hello' }, { id: 'user' } as never, response as never)).rejects.toBeInstanceOf(ServiceUnavailableException);
  expect(chat.acquire).not.toHaveBeenCalled();
  expect(response.writeHead).not.toHaveBeenCalled();
  expect(response.write).not.toHaveBeenCalled();
});


it('reports a readiness race after SSE opens and releases the lock', async () => {
  const chat = {
    assertReady: jest.fn().mockResolvedValue(undefined), acquire: jest.fn(), release: jest.fn(),
    run: async function* () { throw new ServiceUnavailableException({ code: 'SERVICE_NOT_READY' }); yield undefined as never; },
  };
  const conversations = { assertOwned: jest.fn().mockResolvedValue({ agentId: 'agent' }) };
  const agents = { getAgentConfig: jest.fn().mockResolvedValue({}) };
  const response = { writeHead: jest.fn(), write: jest.fn(), on: jest.fn(), end: jest.fn() };
  const controller = new ChatController(chat as never, conversations as never, agents as never);
  await controller.stream('conversation', { content: 'hello' }, { id: 'user' } as never, response as never);
  expect(response.write).toHaveBeenLastCalledWith(expect.stringContaining('SERVICE_NOT_READY'));
  expect(chat.release).toHaveBeenCalledWith('conversation');
  expect(response.end).toHaveBeenCalled();
});


it('keeps the numeric HTTP envelope and exposes a safe readiness code', () => {
  const json = jest.fn();
  const response = { status: jest.fn().mockReturnValue({ json }) };
  const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ path: '/api/conversations/id/messages/stream', url: '/api/conversations/id/messages/stream', method: 'POST' }) }) };
  new HttpExceptionFilter().catch(new ServiceUnavailableException({ code: 'SERVICE_NOT_READY', message: '准备中' }), host as never);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(json).toHaveBeenCalledWith({ code: 503, errorCode: 'SERVICE_NOT_READY', message: '准备中', data: null });
});
