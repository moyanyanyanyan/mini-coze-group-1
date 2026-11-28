import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePdf } from './pdf.parser';

describe('chat attachment PDF parser after knowledge parser merge', () => {
  it('extracts a real PDF using the legacy callable API', async () => {
    const bytes = readFileSync(resolve(__dirname, '../../../../test/fixtures/pdf-detach-regression.pdf'));
    const text = await parsePdf({
      fileName: 'attachment.pdf', mimeType: 'application/pdf', sourceType: 'PDF', bytes,
    });
    expect(text).toContain('PDF_DETACH_PAGE_ONE');
  });
});
