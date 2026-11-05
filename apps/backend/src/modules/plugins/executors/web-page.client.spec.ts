import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { requestPinned, SafeWebPageClient } from './web-page.client';

describe('网页实际传输层', () => {
  let server: Server;
  let url: URL;
  beforeEach(async () => {
    server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/ok' });
        res.flushHeaders();
        return;
      }
      if (req.url === '/compressed') {
        res.writeHead(200, {
          'content-type': 'text/html',
          'content-encoding': 'gzip',
        });
        res.end('invalid');
        return;
      }
      if (req.url === '/error') {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      if (req.url === '/slow') {
        res.flushHeaders();
        return;
      }
      if (req.url === '/large') {
        res.end(Buffer.alloc(2 * 1024 * 1024 + 1));
        return;
      }
      res.end(req.headers.host);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    url = new URL(
      'http://public.example:' + (server.address() as AddressInfo).port,
    );
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  // 仅传输层注入本地地址；生产入口仍执行公网 IP 校验。
  const pinned = { address: '127.0.0.1', family: 4 as const };
  it('使用已校验地址连接并保留原始 Host', async () => {
    const result = await requestPinned(
      url,
      pinned,
      new AbortController().signal,
    );
    expect(result.body.toString()).toBe(url.host);
  });
  it.each(['/large', '/compressed', '/error'])(
    '拒绝异常响应 %s',
    async (path) => {
      await expect(
        requestPinned(new URL(path, url), pinned, new AbortController().signal),
      ).rejects.toThrow();
    },
  );
  it('重定向不等待响应体结束', async () => {
    const result = await requestPinned(
      new URL('/redirect', url),
      pinned,
      new AbortController().signal,
    );
    expect(result.statusCode).toBe(302);
    expect(result.body.length).toBe(0);
  });
  it('取消慢速响应并关闭请求', async () => {
    const controller = new AbortController();
    const pending = requestPinned(
      new URL('/slow', url),
      pinned,
      controller.signal,
    );
    const assertion = expect(pending).rejects.toThrow();
    controller.abort();
    await assertion;
  });
});

describe('网页总截止时间', () => {
  it('DNS 不响应时仍在八秒截止，不发起 HTTP', async () => {
    jest.useFakeTimers();
    try {
      const transport = jest.fn();
      const client = new SafeWebPageClient(
        () => new Promise(() => {}),
        transport,
      );
      const pending = expect(
        client.fetch('https://example.com'),
      ).rejects.toThrow('8000ms');
      await jest.advanceTimersByTimeAsync(8000);
      await pending;
      expect(transport).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
