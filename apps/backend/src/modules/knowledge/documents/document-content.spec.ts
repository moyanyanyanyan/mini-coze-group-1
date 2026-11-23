import { decodeUploadFilename, DocumentContentError, extractDocumentText, MAX_DOCUMENT_BYTES, readDocumentTextPage, sourceTypeFromFilename } from './document-content';

describe('document content extraction', () => {
  it.each(['TXT', 'JSON'] as const)('enforces the 1 MiB %s extraction boundary', (sourceType) => {
    const jsonWrapper = '{"value":""}';
    const bytes = sourceType === 'TXT'
      ? Buffer.alloc(MAX_DOCUMENT_BYTES, 0x61)
      : Buffer.from('{"value":"' + 'a'.repeat(MAX_DOCUMENT_BYTES - jsonWrapper.length) + '"}');
    expect(bytes.byteLength).toBe(MAX_DOCUMENT_BYTES);
    expect(extractDocumentText(sourceType, bytes).length).toBeGreaterThan(0);
    expect(() => extractDocumentText(sourceType, Buffer.concat([bytes, Buffer.from('a')]))).toThrow(
      new DocumentContentError('FILE_TOO_LARGE', '资料不能超过 1 MB'),
    );
  });
  it('keeps nested JSON field paths and array order', () => {
    const bytes = Buffer.from(JSON.stringify({ policy: { meal: 80 }, items: ['发票', '审批单'] }));
    expect(extractDocumentText('JSON', bytes)).toBe('policy.meal: 80\nitems[0]: 发票\nitems[1]: 审批单');
  });

  it('rejects invalid UTF-8 instead of storing replacement characters', () => {
    expect(() => extractDocumentText('TXT', new Uint8Array([0xff]))).toThrow(
      new DocumentContentError('INVALID_ENCODING', '资料必须使用 UTF-8 编码'),
    );
  });

  it('normalizes TXT line endings to the coordinate system used by chunking', () => {
    expect(extractDocumentText('TXT', Buffer.from('第一行\r\n第二行\r第三行'))).toBe('第一行\n第二行\n第三行');
  });

  it('distinguishes invalid JSON from an empty result', () => {
    expect(() => extractDocumentText('JSON', Buffer.from('{broken'))).toThrow(
      new DocumentContentError('INVALID_JSON', 'JSON 文件格式无效'),
    );
  });

  it('accepts supported extensions without trusting unrelated file types', () => {
    expect(sourceTypeFromFilename('rules.txt')).toBe('TXT');
    expect(sourceTypeFromFilename('rules.JSON')).toBe('JSON');
    expect(sourceTypeFromFilename('rules.PDF')).toBe('PDF');
    expect(() => sourceTypeFromFilename('rules.png')).toThrow(DocumentContentError);
  });

  it('recovers a UTF-8 Chinese upload filename read as Latin-1', () => {
    const filename = '阿蕾奇诺小助手.txt';
    expect(decodeUploadFilename(Buffer.from(filename, 'utf8').toString('latin1'))).toBe(filename);
    expect(decodeUploadFilename(filename)).toBe(filename);
    expect(decodeUploadFilename('resume.txt')).toBe('resume.txt');
    expect(decodeUploadFilename('café.txt')).toBe('café.txt');
  });

  it('pages continuous text without splitting Unicode characters or duplicating content', () => {
    const source = `${'😀员工手册\n'.repeat(40)}最后一段`;
    const pages: string[] = [];
    let cursor: string | undefined;
    let page;
    do {
      page = readDocumentTextPage(source, cursor, 100);
      pages.push(page.content);
      cursor = page.nextCursor ?? undefined;
    } while (page.hasMore);
    expect(pages.join('')).toBe(source);
    expect(readDocumentTextPage(source, undefined, 100).content).not.toContain('\uFFFD');
  });
});
