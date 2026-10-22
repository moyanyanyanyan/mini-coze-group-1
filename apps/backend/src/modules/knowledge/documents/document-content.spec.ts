import { DocumentContentError, extractDocumentText, sourceTypeFromFilename } from './document-content';

describe('document content extraction', () => {
  it('keeps nested JSON field paths and array order', () => {
    const bytes = Buffer.from(JSON.stringify({ policy: { meal: 80 }, items: ['发票', '审批单'] }));
    expect(extractDocumentText('JSON', bytes)).toBe('policy.meal: 80\nitems[0]: 发票\nitems[1]: 审批单');
  });

  it('rejects invalid UTF-8 instead of storing replacement characters', () => {
    expect(() => extractDocumentText('TXT', new Uint8Array([0xff]))).toThrow(
      new DocumentContentError('INVALID_ENCODING', '资料必须使用 UTF-8 编码'),
    );
  });

  it('distinguishes invalid JSON from an empty result', () => {
    expect(() => extractDocumentText('JSON', Buffer.from('{broken'))).toThrow(
      new DocumentContentError('INVALID_JSON', 'JSON 文件格式无效'),
    );
  });

  it('accepts supported extensions without trusting unrelated file types', () => {
    expect(sourceTypeFromFilename('rules.JSON')).toBe('JSON');
    expect(() => sourceTypeFromFilename('rules.pdf')).toThrow(DocumentContentError);
  });
});
