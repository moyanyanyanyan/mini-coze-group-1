import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Regression guard for the T6.10A detach defect: pdf-parse transfers (detaches) the caller's
// ArrayBuffer, so a hybrid extraction that snapshots the OCR payload *after* parsing hands the
// worker an empty Buffer and every OCR page fails with OCR_INVALID_REQUEST.
//
// The parser must stay real here (mocking pdf-parse hides the defect), but pdf.js sets up its
// Node "fake worker" with a dynamic import() that jest's VM only allows under
// --experimental-vm-modules. Rather than changing the shared test command, the real parser runs
// in a plain Node child process and jest asserts on its result file.

interface HarnessResult {
  fixtureLength: number;
  calls: Array<{ length: number; isBuffer: boolean; pages: number[] }>;
  methods: string[];
  rawText: string;
  error?: string;
}

describe('PDF hybrid extraction with the real pdf-parse', () => {
  const backendRoot = join(__dirname, '..', '..', '..', '..');
  const fixturePath = join(backendRoot, 'test', 'fixtures', 'pdf-detach-regression.pdf');
  const harnessPath = join(backendRoot, 'test', 'helpers', 'pdf-detach-harness.cjs');

  it('hands the complete PDF bytes to the OCR worker after native extraction', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'minicoze-pdf-detach-'));
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

      // Before the fix, pdf-parse detached the fixture bytes and `length` arrived as 0.
      expect(result.fixtureLength).toBeGreaterThan(0);
      expect(result.calls).toEqual([{ length: result.fixtureLength, isBuffer: true, pages: [2] }]);
      expect(result.methods).toEqual(['native', 'ocr']);
      expect(result.rawText).toContain('PDF_DETACH_PAGE_ONE');
      expect(result.rawText).toContain('PDF_DETACH_OCR_STUB');
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
