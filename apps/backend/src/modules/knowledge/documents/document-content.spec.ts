import {
  decodeUploadFilename,
  MAX_IMAGE_DOCUMENT_BYTES,
  MAX_OFFICE_DOCUMENT_BYTES,
  MAX_TEXT_DOCUMENT_BYTES,
  MAX_UPLOAD_BYTES,
  OcrUnavailableError,
} from './document-content';

describe('document content constants', () => {
  it('separates size limits by document type', () => {
    expect(MAX_TEXT_DOCUMENT_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_OFFICE_DOCUMENT_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_IMAGE_DOCUMENT_BYTES).toBe(5 * 1024 * 1024);
  });

  it('uses the office limit as the global upload limit', () => {
    expect(MAX_UPLOAD_BYTES).toBe(MAX_OFFICE_DOCUMENT_BYTES);
  });

  it('describes OCR unavailability as a dedicated error', () => {
    expect(new OcrUnavailableError().message).toBe('OCR 服务不可用，请稍后重试');
  });

  it('recovers a UTF-8 Chinese upload filename read as Latin-1', () => {
    const filename = '阿蕾奇诺小助手.txt';
    expect(decodeUploadFilename(Buffer.from(filename, 'utf8').toString('latin1'))).toBe(filename);
    expect(decodeUploadFilename(filename)).toBe(filename);
    expect(decodeUploadFilename('resume.txt')).toBe('resume.txt');
    expect(decodeUploadFilename('café.txt')).toBe('café.txt');
  });
});
