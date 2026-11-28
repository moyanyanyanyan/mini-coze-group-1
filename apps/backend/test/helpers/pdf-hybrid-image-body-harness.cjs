#!/usr/bin/env node
'use strict';

// Real pdf-parse regression harness for the "selectable title over a scanned body" page shape.
//
// pdf.js sets up its Node "fake worker" through a dynamic import(), and jest's VM rejects that
// unless jest runs with --experimental-vm-modules (the repository test command does not set it).
// Mocking pdf-parse would hide the defect being guarded here, so the real parser and the real
// hybrid extraction code run in a plain Node process and jest asserts on the result file.

require('ts-node/register/transpile-only');

const fs = require('node:fs');
const path = require('node:path');

const [, , fixturePath, outputPath] = process.argv;
if (!fixturePath || !outputPath) {
  console.error('usage: pdf-hybrid-image-body-harness.cjs <fixture.pdf> <result.json>');
  process.exit(2);
}

const documents = path.join(__dirname, '..', '..', 'src', 'modules', 'knowledge', 'documents');
const { extractPdfDocumentPages } = require(path.join(documents, 'pdf-document-content.ts'));
const { extractHybridPdfDocumentText, selectPdfOcrPages } = require(
  path.join(documents, 'pdf-hybrid-document-content.ts'),
);

// The OCR Worker reads the rendered page, so it also re-reads the native title (here in the
// upper case the engine returns). The body lines are what the real worker extracts from the
// fixture image.
const OCR_LINES = [
  'CONTRACT TERMS',
  'PAYMENT DUE IN 30 DAYS',
  'INVOICE APPROVAL REQUIRED',
];

(async () => {
  const fixture = fs.readFileSync(fixturePath);
  const pages = await extractPdfDocumentPages(new Uint8Array(fixture));
  const ocrPages = selectPdfOcrPages(pages);
  const calls = [];
  const worker = {
    async recognizePdfPages(buffer, _filename, pageNumbers, dpi = 200) {
      calls.push({ length: buffer.length, isBuffer: Buffer.isBuffer(buffer), pages: [...pageNumbers] });
      return {
        status: 'ok',
        pages: pageNumbers.map((pageNumber) => ({
          pageNumber,
          method: 'ocr',
          text: OCR_LINES.join('\n'),
          regions: [],
          elapsedMs: 1,
          renderDpi: dpi,
          width: 1700,
          height: 2200,
        })),
      };
    },
  };

  const { pages: extracted, rawText } = await extractHybridPdfDocumentText(
    new Uint8Array(fixture),
    path.basename(fixturePath),
    worker,
  );

  fs.writeFileSync(outputPath, JSON.stringify({
    fixtureLength: fixture.length,
    nativePages: pages,
    ocrPages,
    calls,
    methods: extracted.map((page) => page.method),
    rawText,
  }));
})().catch((error) => {
  fs.writeFileSync(outputPath, JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
