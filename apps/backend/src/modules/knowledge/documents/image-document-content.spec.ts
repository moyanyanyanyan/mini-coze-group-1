import { imageMaxBytes } from '../../../config/upload-limits';
import { OcrWorkerError, type OcrWorkerResponse } from '../../../integrations/ocr-worker.client';
import { DocumentContentError } from './document-content';
import { assertImageUpload, extractImageDocumentText, imageFormatFromFilename, imageMimeType } from './image-document-content';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);

function page(text: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pageNumber: 1, method: 'ocr' as const, text, regions: [], elapsedMs: 1,
    renderDpi: null, width: null, height: null, ...overrides,
  };
}

function worker(response: OcrWorkerResponse | Error) {
  const recognizeImage = jest.fn();
  if (response instanceof Error) recognizeImage.mockRejectedValue(response);
  else recognizeImage.mockResolvedValue(response);
  return { recognizeImage };
}

describe('image document content', () => {
  it.each([
    ['scan.png', 'PNG'], ['scan.PNG', 'PNG'], ['photo.jpg', 'JPEG'], ['photo.JPEG', 'JPEG'], ['photo.jpeg', 'JPEG'],
  ] as const)('normalizes the %s extension to %s', (filename, format) => {
    expect(imageFormatFromFilename(filename)).toBe(format);
    expect(imageMimeType(format)).toBe(format === 'PNG' ? 'image/png' : 'image/jpeg');
  });

  it('ignores unsupported extensions', () => {
    expect(imageFormatFromFilename('animation.gif')).toBeNull();
    expect(imageFormatFromFilename('vector.svg')).toBeNull();
    expect(imageFormatFromFilename('document.pdf')).toBeNull();
  });

  it.each([
    ['scan.png', 'image/png', 'PNG', PNG_BYTES],
    ['scan.PNG', 'IMAGE/PNG', 'PNG', PNG_BYTES],
    ['photo.jpg', 'image/jpeg', 'JPEG', JPEG_BYTES],
    ['photo.jpeg', 'image/jpg', 'JPEG', JPEG_BYTES],
  ] as const)('accepts %s with matching %s', (filename, mimeType, format, bytes) => {
    expect(assertImageUpload(filename, mimeType, bytes)).toBe(format);
  });

  it('rejects an extension and MIME mismatch', () => {
    expect(() => assertImageUpload('scan.png', 'image/jpeg', PNG_BYTES)).toThrow(/扩展名与 MIME 类型不一致/);
    expect(() => assertImageUpload('photo.jpg', 'image/png', JPEG_BYTES)).toThrow(/扩展名与 MIME 类型不一致/);
    expect(() => assertImageUpload('scan.png', undefined, PNG_BYTES)).toThrow(/无法确认图片的 MIME/);
  });

  it('rejects a renamed file whose bytes do not match the extension', () => {
    expect(() => assertImageUpload('scan.png', 'image/png', JPEG_BYTES)).toThrow(/内容与扩展名不一致/);
    expect(() => assertImageUpload('photo.jpg', 'image/jpeg', PNG_BYTES)).toThrow(/内容与扩展名不一致/);
    expect(() => assertImageUpload('scan.png', 'image/png', Buffer.from('plain text'))).toThrow(/内容与扩展名不一致/);
  });

  it('rejects unsupported image extensions through the image validator', () => {
    expect(() => assertImageUpload('animation.gif', 'image/gif', Buffer.from('GIF89a'))).toThrow(/只支持/);
  });

  it('sends the original Buffer, filename and MIME type to recognizeImage', async () => {
    const ocr = worker({ status: 'ok', pages: [page(' 识别\r\n文本 ')] });
    await expect(extractImageDocumentText(PNG_BYTES, 'scan.PNG', ocr)).resolves.toBe('识别\n文本');
    expect(ocr.recognizeImage).toHaveBeenCalledWith(PNG_BYTES, 'scan.PNG', 'image/png');
  });

  it('uses image/jpeg for .jpg and .jpeg', async () => {
    const ocr = worker({ status: 'ok', pages: [page('jpeg text')] });
    await extractImageDocumentText(JPEG_BYTES, 'photo.jpeg', ocr);
    expect(ocr.recognizeImage).toHaveBeenCalledWith(JPEG_BYTES, 'photo.jpeg', 'image/jpeg');
  });

  it('fails with EMPTY_CONTENT when OCR finds no text', async () => {
    const ocr = worker({ status: 'ok', pages: [page('   \r\n ')] });
    await expect(extractImageDocumentText(PNG_BYTES, 'blank.png', ocr)).rejects.toMatchObject({
      code: 'EMPTY_CONTENT', message: '图片中没有识别到有效文本',
    });
  });

  it.each([
    ['wrong page number', { status: 'ok' as const, pages: [page('text', { pageNumber: 2 })] }],
    ['wrong method', { status: 'ok' as const, pages: [page('text', { method: 'native' })] }],
    ['non-string text', { status: 'ok' as const, pages: [page(undefined as unknown as string)] }],
    ['extra pages', { status: 'ok' as const, pages: [page('one'), page('two')] }],
    ['missing pages', { status: 'ok' as const, pages: undefined as unknown as never[] }],
    ['non-ok status', { status: 'failed' as unknown as 'ok', pages: [page('text')] }],
  ])('rejects an invalid OCR response (%s)', async (_label, response) => {
    const ocr = worker(response);
    await expect(extractImageDocumentText(PNG_BYTES, 'scan.png', ocr)).rejects.toMatchObject({
      name: 'OcrWorkerError', code: 'INVALID_RESPONSE',
    });
  });

  it('fails with UNSUPPORTED_FILE when the image document has no valid file name', async () => {
    const ocr = worker({ status: 'ok', pages: [page('unused')] });
    for (const filename of [null, undefined, '', 'scan.txt']) {
      await expect(extractImageDocumentText(PNG_BYTES, filename, ocr)).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE', message: '图片文档缺少有效的原始文件名',
      });
    }
    expect(ocr.recognizeImage).not.toHaveBeenCalled();
  });

  it('propagates Worker failures from the existing client', async () => {
    const failure = new OcrWorkerError('TIMEOUT', 'OCR Worker 请求超时');
    await expect(extractImageDocumentText(PNG_BYTES, 'scan.png', worker(failure))).rejects.toBe(failure);
  });

  it('rejects empty and oversized image payloads before calling the Worker', async () => {
    const ocr = worker({ status: 'ok', pages: [page('unused')] });
    await expect(extractImageDocumentText(new Uint8Array(), 'scan.png', ocr)).rejects.toBeInstanceOf(DocumentContentError);
    const oversized = Buffer.alloc(imageMaxBytes() + 1, 0x89);
    await expect(extractImageDocumentText(oversized, 'scan.png', ocr)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(ocr.recognizeImage).not.toHaveBeenCalled();
  });
});
