import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { ToolExecutionError } from './tool-executor.interface';

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'MiniCoze-WebReader/1.0';
const ALLOWED_CONTENT_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
]);

export interface WebPageResponse {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  body: string;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface TransportResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;
export type PageTransport = (
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
) => Promise<TransportResponse>;

export class SafeWebPageClient {
  constructor(
    private readonly resolveAddress: AddressResolver = resolveAddresses,
    private readonly transport: PageTransport = requestPinned,
  ) {}

  async fetch(rawUrl: string): Promise<WebPageResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchWithinDeadline(rawUrl, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ToolExecutionError('网页抓取超过 8000ms');
      }
      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(
        '网页读取失败：' +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithinDeadline(
    rawUrl: string,
    signal: AbortSignal,
  ): Promise<WebPageResponse> {
    const requestedUrl = rawUrl;
    let current = parsePublicUrl(rawUrl);

    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
      const hostname = current.hostname.replace(/^\[|\]$/g, '');
      const addresses = await withAbort(this.resolveAddress(hostname), signal);
      if (addresses.length === 0) {
        throw new ToolExecutionError(`无法解析网页域名：${current.hostname}`);
      }
      if (addresses.some((item) => !isPublicIp(item.address))) {
        throw new ToolExecutionError('网页地址解析到了非公网 IP，已拒绝访问');
      }

      let response: TransportResponse;
      try {
        response = await withAbort(
          this.transport(current, addresses[0], signal),
          signal,
        );
      } catch (error) {
        if (error instanceof ToolExecutionError) {
          throw error;
        }
        throw new ToolExecutionError(
          `读取网页失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (isRedirect(response.statusCode)) {
        const location = firstHeader(response.headers.location);
        if (!location) {
          throw new ToolExecutionError(
            '网页返回重定向，但缺少 Location 响应头',
          );
        }
        if (redirectCount === MAX_REDIRECTS) {
          throw new ToolExecutionError(`网页重定向超过 ${MAX_REDIRECTS} 次`);
        }
        current = parsePublicUrl(new URL(location, current).toString());
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new ToolExecutionError(`网页返回 HTTP ${response.statusCode}`);
      }
      if (response.body.byteLength > MAX_RESPONSE_BYTES) {
        throw new ToolExecutionError(
          `网页响应超过 ${MAX_RESPONSE_BYTES} 字节限制`,
        );
      }

      const contentType = normalizeContentType(
        firstHeader(response.headers['content-type']),
      );
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        throw new ToolExecutionError(
          `不支持的网页内容类型：${contentType || '未提供 Content-Type'}`,
        );
      }

      return {
        requestedUrl,
        finalUrl: current.toString(),
        contentType,
        body: decodeBody(response),
      };
    }

    throw new ToolExecutionError('网页读取失败');
  }
}

export function parsePublicUrl(rawUrl: string): URL {
  if (Buffer.byteLength(rawUrl, 'utf8') > 2048) {
    throw new ToolExecutionError('网页 URL 超过 2048 字节限制');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ToolExecutionError('url 必须是合法的 HTTP/HTTPS 地址');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ToolExecutionError('网页抓取仅支持 HTTP/HTTPS 地址');
  }
  if (url.username || url.password) {
    throw new ToolExecutionError('网页地址不能包含用户名或密码');
  }
  const hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new ToolExecutionError('禁止访问本机地址');
  }
  if (isIP(hostname) !== 0 && !isPublicIp(hostname)) {
    throw new ToolExecutionError('禁止访问非公网 IP');
  }
  return url;
}

export function isPublicIp(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  const family = isIP(normalized);
  if (family === 4) {
    return isPublicIpv4(normalized);
  }
  if (family === 6) {
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mapped) {
      return isPublicIpv4(mapped);
    }
    if (normalized === '::' || normalized === '::1') {
      return false;
    }
    if (
      /^2001:(?:0*:|0*[01][0-9a-f]:|db8:)/.test(normalized) ||
      normalized.startsWith('2002:') ||
      normalized.startsWith('3fff:')
    ) {
      return false;
    }
    const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return firstGroup >= 0x2000 && firstGroup <= 0x3fff;
  }
  return false;
}

async function resolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.map((item) => ({
    address: item.address,
    family: item.family as 4 | 6,
  }));
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)
  ) {
    return false;
  }
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) {
    return false;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return false;
  }
  if (a === 169 && b === 254) {
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if (a === 192 && (b === 0 || b === 168)) {
    return false;
  }
  if (a === 192 && b === 88 && c === 99) {
    return false;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return false;
  }
  if (a === 198 && b === 51 && c === 100) {
    return false;
  }
  if (a === 203 && b === 0 && c === 113) {
    return false;
  }
  return true;
}

export function requestPinned(
  url: URL,
  resolved: ResolvedAddress,
  signal: AbortSignal,
): Promise<TransportResponse> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      signal,
      agent: false,
      family: resolved.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        'accept-encoding': 'identity',
        'user-agent': USER_AGENT,
      },
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          callback(null, [resolved]);
        } else {
          callback(null, resolved.address, resolved.family);
        }
      },
    };

    const req = request(options, (res) => {
      const statusCode = res.statusCode ?? 0;
      if (isRedirect(statusCode)) {
        res.destroy();
        resolve({ statusCode, headers: res.headers, body: Buffer.alloc(0) });
        return;
      }

      try {
        validateHeaders(statusCode, res.headers);
      } catch (error) {
        res.destroy();
        reject(error);
        return;
      }

      const declaredLength = Number(firstHeader(res.headers['content-length']));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_RESPONSE_BYTES
      ) {
        res.destroy();
        reject(
          new ToolExecutionError(`网页响应超过 ${MAX_RESPONSE_BYTES} 字节限制`),
        );
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          res.destroy();
          reject(
            new ToolExecutionError(
              `网页响应超过 ${MAX_RESPONSE_BYTES} 字节限制`,
            ),
          );
          return;
        }
        chunks.push(buffer);
      });
      res.on('end', () => {
        resolve({
          statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      res.on('error', reject);
      res.on('aborted', () => reject(new ToolExecutionError('网页响应中断')));
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(
        new ToolExecutionError(`网页请求超过 ${REQUEST_TIMEOUT_MS}ms`),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ToolExecutionError('网页抓取超时'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

function validateHeaders(status: number, headers: IncomingHttpHeaders): void {
  if (status < 200 || status >= 300) {
    throw new ToolExecutionError(`网页返回 HTTP ${status}`);
  }
  const encoding = firstHeader(headers['content-encoding']);
  if (encoding && encoding.toLowerCase() !== 'identity') {
    throw new ToolExecutionError('不支持压缩的网页响应');
  }
  if (
    !ALLOWED_CONTENT_TYPES.has(
      normalizeContentType(firstHeader(headers['content-type'])),
    )
  ) {
    throw new ToolExecutionError('不支持的网页内容类型');
  }
}

function decodeBody(response: TransportResponse): string {
  validateHeaders(response.statusCode, response.headers);
  const charset =
    /charset\s*=\s*["']?([^;"'\s]+)/i.exec(
      firstHeader(response.headers['content-type']) ?? '',
    )?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset, { fatal: true }).decode(response.body);
  } catch {
    throw new ToolExecutionError('网页字符编码不支持或内容损坏：' + charset);
  }
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeContentType(value: string | undefined): string {
  return value?.split(';')[0].trim().toLowerCase() ?? '';
}
