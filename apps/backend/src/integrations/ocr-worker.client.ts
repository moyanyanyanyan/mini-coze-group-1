import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OcrWorkerRegion {
  text: string;
  score: number;
  polygon: [number, number][];
}

export interface OcrWorkerPage {
  pageNumber: number;
  method: 'ocr';
  text: string;
  regions: OcrWorkerRegion[];
  elapsedMs: number;
  renderDpi?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface OcrWorkerResponse {
  status: 'ok';
  pages: OcrWorkerPage[];
}

export type OcrWorkerErrorCode =
  | 'CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'WORKER_AUTH_FAILED'
  | 'FILE_TOO_LARGE'
  | 'WORKER_BUSY'
  | 'WORKER_REJECTED'
  | 'WORKER_FAILED'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class OcrWorkerError extends Error {
  constructor(public readonly code: OcrWorkerErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'OcrWorkerError';
  }
}

const DEFAULT_WORKER_URL = 'http://127.0.0.1:8001';
const DEFAULT_TIMEOUT_MS = 600_000;

@Injectable()
export class OcrWorkerClient {
  constructor(private readonly config: ConfigService) {}

  recognizeImage(buffer: Buffer, filename: string, mimeType: string): Promise<OcrWorkerResponse> {
    const form = this.fileForm(buffer, filename, mimeType);
    return this.post('/internal/ocr/image', form, [1], false);
  }

  recognizePdfPages(buffer: Buffer, filename: string, pageNumbers: number[], dpi = 200): Promise<OcrWorkerResponse> {
    if (!Array.isArray(pageNumbers) || pageNumbers.length === 0 ||
        pageNumbers.some((page) => !Number.isSafeInteger(page) || page < 1) ||
        new Set(pageNumbers).size !== pageNumbers.length ||
        !Number.isInteger(dpi) || dpi < 72 || dpi > 300) {
      throw new OcrWorkerError('INVALID_REQUEST', 'OCR PDF 页码或 DPI 无效');
    }
    const form = this.fileForm(buffer, filename, 'application/pdf');
    form.append('pageNumbers', JSON.stringify(pageNumbers));
    form.append('dpi', String(dpi));
    return this.post('/internal/ocr/pdf/pages', form, pageNumbers, true, dpi);
  }

  private fileForm(buffer: Buffer, filename: string, mimeType: string): FormData {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || !filename?.trim() || !mimeType?.trim()) {
      throw new OcrWorkerError('INVALID_REQUEST', 'OCR 文件参数无效');
    }
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(buffer)], { type: mimeType }), filename);
    return form;
  }

  private async post(
    path: string,
    form: FormData,
    expectedPages: number[],
    pdf: boolean,
    dpi?: number,
  ): Promise<OcrWorkerResponse> {
    const token = this.config.get<string>('OCR_WORKER_TOKEN')?.trim();
    if (!token) throw new OcrWorkerError('CONFIGURATION', 'OCR Worker 内部凭证未配置');

    const baseUrl = this.config.get<string>('OCR_WORKER_URL')?.trim() || DEFAULT_WORKER_URL;
    let url: URL;
    try {
      const base = new URL(baseUrl);
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('invalid URL');
      url = new URL(path, base);
    } catch {
      throw new OcrWorkerError('CONFIGURATION', 'OCR Worker 地址配置无效');
    }
    const configuredTimeout = this.config.get<string | number>('OCR_WORKER_TIMEOUT_MS');
    const timeoutMs = configuredTimeout === undefined || configuredTimeout === ''
      ? DEFAULT_TIMEOUT_MS : Number(configuredTimeout);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new OcrWorkerError('CONFIGURATION', 'OCR Worker 超时配置无效');
    }

    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal,
        redirect: 'error',
      });
    } catch {
      if (signal.aborted && (signal.reason as { name?: string } | null)?.name === 'TimeoutError') {
        throw new OcrWorkerError('TIMEOUT', 'OCR Worker 请求超时');
      }
      throw new OcrWorkerError('UNAVAILABLE', 'OCR Worker 无法连接');
    }

    if (!response.ok) throw statusError(response.status);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (signal.aborted && (signal.reason as { name?: string } | null)?.name === 'TimeoutError') {
        throw new OcrWorkerError('TIMEOUT', 'OCR Worker 请求超时');
      }
      throw new OcrWorkerError('INVALID_RESPONSE', 'OCR Worker 返回的 JSON 无效');
    }
    if (!isOcrResponse(data, expectedPages, pdf, dpi)) {
      throw new OcrWorkerError('INVALID_RESPONSE', 'OCR Worker 返回结构无效');
    }
    return data;
  }
}

function statusError(status: number): OcrWorkerError {
  if (status === 401 || status === 403) return new OcrWorkerError('WORKER_AUTH_FAILED', 'OCR Worker 内部认证失败', status);
  if (status === 413) return new OcrWorkerError('FILE_TOO_LARGE', '文件超过 OCR Worker 上传限制', status);
  if (status === 429) return new OcrWorkerError('WORKER_BUSY', 'OCR Worker 当前任务已满', status);
  if (status >= 500) return new OcrWorkerError('WORKER_FAILED', 'OCR Worker 内部处理失败', status);
  return new OcrWorkerError('WORKER_REJECTED', 'OCR Worker 拒绝了请求', status);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function optionalPositiveInteger(value: unknown): value is number | null | undefined {
  return value === null || value === undefined || (nonnegativeInteger(value) && value > 0);
}

function isOcrResponse(value: unknown, expectedPages: number[], pdf: boolean, dpi?: number): value is OcrWorkerResponse {
  if (!record(value) || value.status !== 'ok' || !Array.isArray(value.pages) || value.pages.length !== expectedPages.length) return false;
  return value.pages.every((page: unknown, index: number) => {
    if (!record(page) || page.pageNumber !== expectedPages[index] || page.method !== 'ocr' ||
        typeof page.text !== 'string' || !nonnegative(page.elapsedMs) || !Array.isArray(page.regions)) return false;
    if (pdf && (page.renderDpi !== dpi || !optionalPositiveInteger(page.width) || !optionalPositiveInteger(page.height) ||
        page.width === null || page.width === undefined || page.height === null || page.height === undefined)) return false;
    if (!pdf && [page.renderDpi, page.width, page.height].some((field) => field !== null && field !== undefined)) return false;
    return page.regions.every((region: unknown) => record(region) && typeof region.text === 'string' &&
      nonnegative(region.score) && region.score <= 1 && Array.isArray(region.polygon) && region.polygon.length === 4 &&
      region.polygon.every((point: unknown) => Array.isArray(point) && point.length === 2 &&
        point.every((coordinate: unknown) => nonnegativeInteger(coordinate))));
  });
}
