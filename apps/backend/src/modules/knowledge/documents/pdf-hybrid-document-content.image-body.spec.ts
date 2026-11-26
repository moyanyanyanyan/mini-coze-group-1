import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Regression guard for the hybrid-PDF miss where a selectable title made the whole page skip
// OCR, so an image-only body never reached rawText and the document still reported READY.
//
// The parser must stay real here (mocking pdf-parse hides whether an embedded image is detected),
// which is why it runs in a plain Node child process: pdf.js loads its fake worker through a
// dynamic import() that jest's VM only allows under --experimental-vm-modules.

interface HarnessResult {
  fixtureLength: number;
  nativePages: Array<{ pdfPageNumber: number; text: string; hasEmbeddedImage?: boolean }>;
  ocrPages: number[];
  calls: Array<{ length: number; isBuffer: boolean; pages: number[] }>;
  methods: string[];
  rawText: string;
  error?: string;
}

describe('PDF hybrid extraction with a native title over a scanned body', () => {
  const backendRoot = join(__dirname, '..', '..', '..', '..');
  const fixturePath = join(backendRoot, 'test', 'fixtures', 'hybrid-title-image-body.pdf');
  const harnessPath = join(backendRoot, 'test', 'helpers', 'pdf-hybrid-image-body-harness.cjs');

  it('sends the page to OCR and merges the native title with the scanned body', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'minicoze-pdf-image-body-'));
    const resultPath = join(workDir, 'result.json');
    try {
      const run = spawnSync(process.execPath, [harnessPath, fixturePath, resultPath], {
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...process.env, TS_NODE_PROJECT: join(backendRoot, 'tsconfig.json') },
      });
      expect(run.error).toBeUndefined();

      const result = JSON.parse(readFileSync(resultPath, 'utf8')) as HarnessResult;
      expect(result.error).toBeUndefined();
      expect(run.status).toBe(0);

      // The title is selectable text, but the page still carries the body as an image.
      expect(result.nativePages).toEqual([
        { pdfPageNumber: 1, text: 'Contract terms', hasEmbeddedImage: true },
      ]);
      // Before the fix this list was empty: the title alone made the page look text-complete.
      expect(result.ocrPages).toEqual([1]);
      expect(result.calls).toEqual([{ length: result.fixtureLength, isBuffer: true, pages: [1] }]);
      expect(result.methods).toEqual(['ocr']);

      // OCR re-reads the rendered title in upper case; the merged text must keep it exactly once.
      expect(result.rawText).toBe(
        'Contract terms\nPAYMENT DUE IN 30 DAYS\nINVOICE APPROVAL REQUIRED',
      );
      expect(result.rawText.match(/contract terms/gi)).toHaveLength(1);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
