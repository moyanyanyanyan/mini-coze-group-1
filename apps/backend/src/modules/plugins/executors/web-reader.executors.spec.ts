import {
  SafeWebPageClient,
  isPublicIp,
  type AddressResolver,
  type PageTransport,
} from './web-page.client';
import {
  ExtractWebpageLinksExecutor,
  ExtractWebpageMetadataExecutor,
  ReadWebpageExecutor,
} from './web-reader.executors';

const publicResolver: AddressResolver = jest.fn(async () => [
  { address: '93.184.216.34', family: 4 as const },
]);

function response(
  body: string | Buffer,
  contentType = 'text/html; charset=utf-8',
) {
  return {
    statusCode: 200,
    headers: { 'content-type': contentType },
    body: Buffer.isBuffer(body) ? body : Buffer.from(body),
  };
}

function clientWith(transport: PageTransport): SafeWebPageClient {
  return new SafeWebPageClient(publicResolver, transport);
}

describe('web reader executors', () => {
  it('中文正文和元数据的完整结果保持在 Runtime 字节限制内', async () => {
    const client = clientWith(async () =>
      response(
        '<title>' +
          '标题'.repeat(8000) +
          '</title><main>' +
          '中文😀'.repeat(10000) +
          '</main>',
      ),
    );
    for (const executor of [
      new ReadWebpageExecutor(client),
      new ExtractWebpageMetadataExecutor(client),
    ]) {
      const output = await executor.execute({ url: 'https://example.com' });
      expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(
        12000,
      );
      expect(
        Buffer.byteLength(
          JSON.stringify({
            toolCallId: 'c'.repeat(200),
            toolName: executor.definition.name,
            status: 'succeeded',
            output,
          }),
        ),
      ).toBeLessThan(16000);
      expect(output.truncated).toBe(true);
    }
  });
  const html = `
    <html lang="zh-CN">
      <head>
        <title>测试文章</title>
        <meta name="description" content="页面描述">
        <meta name="author" content="作者甲">
        <meta property="article:published_time" content="2026-11-04">
      </head>
      <body>
        <nav>导航内容</nav>
        <main><h1>正文标题</h1><p>这是 正文。</p><script>危险脚本</script></main>
        <a href="/docs">文档</a>
        <a href="/docs#part">重复文档</a>
        <a href="mailto:test@example.com">邮件</a>
      </body>
    </html>`;

  it('提取并清洗网页正文', async () => {
    const transport = jest.fn(async () => response(html));
    const executor = new ReadWebpageExecutor(clientWith(transport));

    await expect(
      executor.execute({ url: 'https://example.com/article' }),
    ).resolves.toEqual({
      url: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      title: '测试文章',
      description: '页面描述',
      content: '正文标题 这是 正文。',
      contentLength: 11,
      truncated: false,
    });
  });

  it('提取网页元数据', async () => {
    const executor = new ExtractWebpageMetadataExecutor(
      clientWith(jest.fn(async () => response(html))),
    );

    await expect(
      executor.execute({ url: 'https://example.com/article' }),
    ).resolves.toEqual({
      url: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      title: '测试文章',
      description: '页面描述',
      author: '作者甲',
      publishedAt: '2026-11-04',
      language: 'zh-CN',
      truncated: false,
    });
  });

  it('解析相对链接、过滤协议并去重', async () => {
    const executor = new ExtractWebpageLinksExecutor(
      clientWith(jest.fn(async () => response(html))),
    );

    const result = await executor.execute({
      url: 'https://example.com/article',
    });
    expect(result).toEqual({
      url: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      title: '测试文章',
      links: [{ text: '文档', url: 'https://example.com/docs' }],
      truncated: false,
    });
  });

  it('限制正文长度和链接数量', async () => {
    const longBody = `<main>${'a'.repeat(20_001)}</main>`;
    const links = Array.from(
      { length: 101 },
      (_, index) => `<a href="/page-${index}">${index}</a>`,
    ).join('');
    const client = clientWith(
      jest
        .fn()
        .mockResolvedValueOnce(response(longBody))
        .mockResolvedValueOnce(response(`<html><body>${links}</body></html>`)),
    );

    const pageResult = await new ReadWebpageExecutor(client).execute({
      url: 'https://example.com/long',
    });
    expect(Buffer.byteLength(JSON.stringify(pageResult))).toBeLessThanOrEqual(
      12000,
    );
    expect(pageResult.truncated).toBe(true);

    const linkResult = await new ExtractWebpageLinksExecutor(client).execute({
      url: 'https://example.com/links',
    });
    expect(linkResult.links).toHaveLength(100);
    expect(linkResult.truncated).toBe(true);
  });
});

describe('SafeWebPageClient', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ])('拒绝非公网地址 %s', (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  it('允许公网 IPv4 和 IPv6', () => {
    expect(isPublicIp('93.184.216.34')).toBe(true);
    expect(isPublicIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
  });

  it('拒绝 localhost 和包含凭证的 URL', async () => {
    const client = clientWith(jest.fn());
    await expect(client.fetch('http://localhost/a')).rejects.toThrow(
      '本机地址',
    );
    await expect(client.fetch('https://user:pass@example.com')).rejects.toThrow(
      '用户名或密码',
    );
  });

  it('拒绝解析到内网的域名', async () => {
    const client = new SafeWebPageClient(
      async () => [{ address: '192.168.1.2', family: 4 }],
      jest.fn(),
    );
    await expect(client.fetch('https://example.com')).rejects.toThrow(
      '非公网 IP',
    );
  });

  it('拒绝重定向到本机地址', async () => {
    const transport = jest.fn(async () => ({
      statusCode: 302,
      headers: { location: 'http://127.0.0.1/private' },
      body: Buffer.alloc(0),
    }));
    await expect(
      clientWith(transport).fetch('https://example.com'),
    ).rejects.toThrow('非公网 IP');
  });

  it('拒绝非文本内容和超大响应', async () => {
    await expect(
      clientWith(jest.fn(async () => response('binary', 'image/png'))).fetch(
        'https://example.com/image',
      ),
    ).rejects.toThrow('不支持的网页内容类型');

    await expect(
      clientWith(
        jest.fn(async () => response(Buffer.alloc(2 * 1024 * 1024 + 1))),
      ).fetch('https://example.com/large'),
    ).rejects.toThrow('网页响应超过');
  });

  it('透传网络超时并转换为工具执行错误', async () => {
    const client = clientWith(
      jest.fn(async () => {
        throw new Error('timeout');
      }),
    );
    await expect(client.fetch('https://example.com')).rejects.toThrow(
      '读取网页失败：timeout',
    );
  });
});
