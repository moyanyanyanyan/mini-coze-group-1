#!/usr/bin/env node
'use strict';

// Real pdf-parse regression harness.
//
// pdf.js sets up its Node "fake worker" through a dynamic import(), and jest's VM rejects that
// unless jest runs with --experimental-vm-modules (the repository test command does not set it).
// Mocking pdf-parse would hide the regression, so the check runs here, in a plain Node process,
// with the real parser and the real hybrid extraction code.

require('ts-node/register/transpile-only');

const fs = require('node:fs');
const path = require('node:path');

const [, , fixturePath, outputPath] = process.argv;
if (!fixturePath || !outputPath) {
  console.error('usage: pdf-detach-harness.cjs <fixture.pdf> <result.json>');
  process.exit(2);
}

const { extractHybridPdfDocumentText } = require(
  path.join(__dirname, '..', '..', 'src', 'modules', 'knowledge', 'documents', 'pdf-hybrid-document-content.ts'),
);

(async () => {
  const fixture = fs.readFileSync(fixturePath);
  const calls = [];
  const worker = {
    async recognizePdfPages(buffer, _filename, pageNumbers, dpi = 200) {
      calls.push({ length: buffer.length, isBuffer: Buffer.isBuffer(buffer), pages: [...pageNumbers] });
      return {
        status: 'ok',
        pages: pageNumbers.map((pageNumber) => ({
          pageNumber,
          method: 'ocr',
          text: 'PDF_DETACH_OCR_STUB',
          regions: [],
          elapsedMs: 1,
          renderDpi: dpi,
          width: 1700,
          height: 2200,
        })),
      };
    },
  };

  const { pages, rawText } = await extractHybridPdfDocumentText(
    new Uint8Array(fixture),
    'pdf-detach-regression.pdf',
    worker,
  );

  fs.writeFileSync(outputPath, JSON.stringify({
    fixtureLength: fixture.length,
    calls,
    methods: pages.map((page) => page.method),
    rawText,
  }));
})().catch((error) => {
  fs.writeFileSync(outputPath, JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
