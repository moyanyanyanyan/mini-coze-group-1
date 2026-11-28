import type { ConfigService } from '@nestjs/config';
import { OcrWorkerClient, OcrWorkerError, type OcrWorkerResponse } from './ocr-worker.client';

const token = 'test-secret-should-never-be-logged';
const imagePage = {
  pageNumber: 1, method: 'ocr', text: '中文识别', elapsedMs: 105.5,
  regions: [{ text: '中文识别', score: 0.97, polygon: [[0, 0], [100, 0], [100, 30], [0, 30]] }],
  renderDpi: null, width: null, height: null,
};
const pdfPage = { ...imagePage, pageNumber: 2, renderDpi: 200, width: 1700, height: 2200 };

function client(values: Record<string, string | undefined> = {}) {
  const configuration = {
    OCR_WORKER_TOKEN: token,
    OCR_WORKER_URL: 'http://127.0.0.1:8001',
    ...values,
  };
  const config = { get: (key: string) => configuration[key as keyof typeof configuration] } as ConfigService;
  return new OcrWorkerClient(config);
}

function success(page: object = imagePage) {
  return Response.json({ status: 'ok', pages: [page] });
}

function errorCode(error: unknown, code: string, status?: number) {
  expect(error).toBeInstanceOf(OcrWorkerError);
  const failure = error as OcrWorkerError;
  expect(failure.code).toBe(code);
  expect(failure.status).toBe(status);
  expect(failure.message).not.toContain(token);
  expect(failure.stack).not.toContain(token);
}

async function expectFailure(operation: Promise<unknown>, code: string, status?: number) {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }
  errorCode(failure, code, status);
}

describe('OcrWorkerClient', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('sends an image Buffer as multipart file with its filename, MIME type and Bearer token', async () => {
    fetchMock.mockResolvedValue(success());
    const bytes = Buffer.from([1, 2, 3]);
    const result: OcrWorkerResponse = await client().recognizeImage(bytes, 'example.png', 'image/png');
    expect(result.pages[0].regions[0].polygon).toEqual([[0, 0], [100, 0], [100, 30], [0, 30]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:8001/internal/ocr/image');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: `Bearer ${token}` });
    expect(init?.redirect).toBe('error');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    const form = init?.body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('example.png');
    expect(file.type).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
  });

  it('serializes PDF pages and DPI into Worker multipart fields and validates page order', async () => {
    const second = { ...pdfPage, pageNumber: 96 };
    fetchMock.mockResolvedValue(Response.json({ status: 'ok', pages: [pdfPage, second] }));
    const bytes = Buffer.from('%PDF-1.7');
    const result = await client().recognizePdfPages(bytes, 'book.pdf', [2, 96]);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([2, 96]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:8001/internal/ocr/pdf/pages');
    const form = init?.body as FormData;
    expect(form.get('pageNumbers')).toBe('[2,96]');
    expect(form.get('dpi')).toBe('200');
    const file = form.get('file') as File;
    expect(file.name).toBe('book.pdf');
    expect(file.type).toBe('application/pdf');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
  });

  it('uses a configured DPI and accepts an image response with omitted optional PDF fields', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: 'ok', pages: [{
      pageNumber: 1, method: 'ocr', text: '', regions: [], elapsedMs: 0,
    }] }));
    await expect(client().recognizeImage(Buffer.from('image'), 'x.png', 'image/png')).resolves.toMatchObject({ status: 'ok' });
    fetchMock.mockResolvedValueOnce(success({ ...pdfPage, renderDpi: 250 }));
    await client().recognizePdfPages(Buffer.from('%PDF-1.7'), 'book.pdf', [2], 250);
    expect((fetchMock.mock.calls[1][1]?.body as FormData).get('dpi')).toBe('250');
  });

  it.each([
    [401, 'WORKER_AUTH_FAILED'], [403, 'WORKER_AUTH_FAILED'], [413, 'FILE_TOO_LARGE'],
    [429, 'WORKER_BUSY'], [500, 'WORKER_FAILED'], [503, 'WORKER_FAILED'],
    [400, 'WORKER_REJECTED'], [422, 'WORKER_REJECTED'],
  ] as const)('maps Worker HTTP %i to %s without leaking its body', async (status, code) => {
    fetchMock.mockResolvedValue(new Response(`diagnostics and ${token}`, { status }));
    await expectFailure(client().recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), code, status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distinguishes timeout from network failure', async () => {
    fetchMock.mockImplementationOnce((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    await expectFailure(client({ OCR_WORKER_TIMEOUT_MS: '5' }).recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), 'TIMEOUT');

    fetchMock.mockRejectedValueOnce(new Error(`private network diagnostic ${token}`));
    await expectFailure(client().recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), 'UNAVAILABLE');
  });

  it('rejects invalid JSON and malformed successful responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not JSON'));
    await expectFailure(client().recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), 'INVALID_RESPONSE');

    for (const page of [
      { ...imagePage, regions: [{ ...imagePage.regions[0], score: 1.5 }] },
      { ...imagePage, pageNumber: 2 },
      { ...imagePage, regions: [{ ...imagePage.regions[0], polygon: [] }] },
    ]) {
      fetchMock.mockResolvedValueOnce(success(page));
      await expectFailure(client().recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), 'INVALID_RESPONSE');
    }
    fetchMock.mockResolvedValueOnce(success({ ...pdfPage, width: null }));
    await expectFailure(client().recognizePdfPages(Buffer.from('%PDF-1.7'), 'x.pdf', [2]), 'INVALID_RESPONSE');
  });

  it('requires its own token and rejects invalid configuration before any request', async () => {
    await expectFailure(client({ OCR_WORKER_TOKEN: '' }).recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), 'CONFIGURATION');
    await expectFailure(client({ OCR_WORKER_URL: 'file:///tmp/worker' }).recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), 'CONFIGURATION');
    await expectFailure(client({ OCR_WORKER_TIMEOUT_MS: 'oops' }).recognizeImage(Buffer.from([1]), 'x.png', 'image/png'), 'CONFIGURATION');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never logs the token or worker error body', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fetchMock.mockResolvedValue(new Response(`sensitive ${token}`, { status: 401 }));
      await expect(client().recognizeImage(Buffer.from([1]), 'x.png', 'image/png')).rejects.toMatchObject({
        code: 'WORKER_AUTH_FAILED', status: 401,
      });
      expect(spy.mock.calls.flat().join(' ')).not.toContain(token);
    } finally {
      spy.mockRestore();
    }
  });
});
